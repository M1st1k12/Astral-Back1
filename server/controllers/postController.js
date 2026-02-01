import Post from "../models/Post.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";

function extractHashtags(text) {
  const tags = text.match(/#\w+/g) || [];
  return tags.map((t) => t.toLowerCase());
}

async function emitNotification(io, notification) {
  const populated = await Notification.findById(notification._id)
    .populate("from", "username avatar")
    .populate("post", "content mediaUrl mediaType");
  io.to(notification.user.toString()).emit("notification:new", populated);
}

async function markViews(posts, userId) {
  if (!userId || posts.length === 0) return;
  const ops = posts
    .filter((p) => p.author?._id?.toString() !== userId.toString())
    .map((p) =>
      Post.updateOne(
        { _id: p._id, viewedBy: { $ne: userId } },
        { $addToSet: { viewedBy: userId }, $inc: { views: 1 } }
      )
    );
  if (ops.length > 0) await Promise.all(ops);
}

export async function createPost(req, res, next) {
  try {
    const { content } = req.body;
    let mediaUrl = "";
    let mediaType = "none";

    if (req.file) {
      mediaUrl = `/uploads/${req.file.filename}`;
      mediaType = req.file.mimetype.startsWith("image/") ? "image" : "file";
    }

    const hashtags = extractHashtags(content || "");

    const post = await Post.create({
      author: req.user.id,
      content: content || "",
      mediaUrl,
      mediaType,
      hashtags
    });

    const populated = await Post.findById(post._id).populate(
      "author",
      "username avatar clan"
    );

    res.status(201).json({ post: populated });
  } catch (err) {
    next(err);
  }
}

export async function getFeed(req, res, next) {
  try {
    const me = await User.findById(req.user.id).select("following hiddenPosts mutedUsers");
    const ids = [req.user.id, ...(me?.following || [])];

    const posts = await Post.find({
      author: { $in: ids, $nin: me?.mutedUsers || [] },
      _id: { $nin: me?.hiddenPosts || [] },
      repostOf: null
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("author", "username userTag avatar clan")
      .populate("comments.user", "username avatar")
      .populate({ path: "repostOf", populate: { path: "author", select: "username avatar clan" } });

    await markViews(posts, req.user.id);

    res.json({ posts });
  } catch (err) {
    next(err);
  }
}

export async function getGlobalFeed(req, res, next) {
  try {
    const me = await User.findById(req.user.id).select("following hiddenPosts mutedUsers");
    const following = new Set((me?.following || []).map((id) => id.toString()));
    following.add(req.user.id);

    const posts = await Post.find({
      _id: { $nin: me?.hiddenPosts || [] },
      repostOf: null
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("author", "username userTag avatar clan isPrivate")
      .populate("comments.user", "username avatar")
      .populate({ path: "repostOf", populate: { path: "author", select: "username avatar clan" } });

    const visible = posts.filter((p) => {
      if (me?.mutedUsers?.some((id) => id.toString() === p.author?._id?.toString())) return false;
      if (p.author?.isPrivate && !following.has(p.author._id.toString())) return false;
      return true;
    });

    const now = Date.now();
    const scored = visible.map((p) => {
      const ageHours = (now - new Date(p.createdAt).getTime()) / 36e5;
      const likes = p.likes?.length || 0;
      const comments = p.comments?.length || 0;
      const score = likes * 2 + comments * 3 + Math.max(0, 24 - ageHours);
      return { p, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const result = scored.slice(0, 50).map((s) => s.p);

    await markViews(result, req.user.id);

    res.json({ posts: result });
  } catch (err) {
    next(err);
  }
}

export async function getFollowingFeed(req, res, next) {
  try {
    const me = await User.findById(req.user.id).select("following hiddenPosts mutedUsers");
    const ids = me?.following || [];

    const posts = await Post.find({
      author: { $in: ids, $nin: me?.mutedUsers || [] },
      _id: { $nin: me?.hiddenPosts || [] },
      repostOf: null
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("author", "username userTag avatar clan")
      .populate("comments.user", "username avatar")
      .populate({ path: "repostOf", populate: { path: "author", select: "username avatar clan" } });

    await markViews(posts, req.user.id);

    res.json({ posts });
  } catch (err) {
    next(err);
  }
}

export async function getUserPosts(req, res, next) {
  try {
    const user = await User.findById(req.params.id).select("followers isPrivate");
    if (!user) return res.status(404).json({ message: "User not found" });
    const isFollowing = user.followers.some((id) => id.toString() === req.user.id);
    if (user.isPrivate && req.user.id !== req.params.id && !isFollowing) {
      return res.status(403).json({ message: "Private profile" });
    }

    const posts = await Post.find({ author: req.params.id })
      .sort({ createdAt: -1 })
      .populate("author", "username avatar clan")
      .populate("comments.user", "username avatar");
    res.json({ posts });
  } catch (err) {
    next(err);
  }
}

export async function toggleLike(req, res, next) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const already = post.likes.some((id) => id.toString() === req.user.id);
    if (already) {
      post.likes = post.likes.filter((id) => id.toString() !== req.user.id);
    } else {
      post.likes.push(req.user.id);
      if (post.author.toString() !== req.user.id) {
        const notification = await Notification.create({
          user: post.author,
          from: req.user.id,
          type: "like",
          post: post._id
        });
        await emitNotification(req.app.get("io"), notification);
      }
    }
    await post.save();

    const populated = await Post.findById(post._id)
      .populate("author", "username avatar clan")
      .populate("comments.user", "username avatar");

    res.json({ post: populated });
  } catch (err) {
    next(err);
  }
}

export async function addComment(req, res, next) {
  try {
    const { text } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (!text?.trim()) return res.status(400).json({ message: "Comment required" });

    post.comments.push({ user: req.user.id, text });
    await post.save();

    if (post.author.toString() !== req.user.id) {
      const notification = await Notification.create({
        user: post.author,
        from: req.user.id,
        type: "comment",
        post: post._id
      });
      await emitNotification(req.app.get("io"), notification);
    }

    const populated = await Post.findById(post._id)
      .populate("author", "username avatar clan")
      .populate("comments.user", "username avatar");

    res.json({ post: populated });
  } catch (err) {
    next(err);
  }
}

export async function repost(req, res, next) {
  try {
    const original = await Post.findById(req.params.id);
    if (!original) return res.status(404).json({ message: "Post not found" });

    const exists = await Post.findOne({ author: req.user.id, repostOf: original._id });
    if (exists) return res.status(400).json({ message: "Already reposted" });

    const post = await Post.create({
      author: req.user.id,
      content: "",
      mediaUrl: "",
      mediaType: "none",
      repostOf: original._id,
      hashtags: []
    });

    if (original.author.toString() !== req.user.id) {
      const notification = await Notification.create({
        user: original.author,
        from: req.user.id,
        type: "repost",
        post: original._id
      });
      await emitNotification(req.app.get("io"), notification);
    }

    const populated = await Post.findById(post._id)
      .populate("author", "username avatar clan")
      .populate({ path: "repostOf", populate: { path: "author", select: "username avatar clan" } });
    res.status(201).json({ post: populated });
  } catch (err) {
    next(err);
  }
}

export async function toggleBookmark(req, res, next) {
  try {
    const postId = req.params.id;
    const user = await User.findById(req.user.id);
    const exists = user.bookmarks.some((id) => id.toString() === postId);
    if (exists) {
      user.bookmarks = user.bookmarks.filter((id) => id.toString() !== postId);
    } else {
      user.bookmarks.push(postId);
    }
    await user.save();
    res.json({ bookmarks: user.bookmarks });
  } catch (err) {
    next(err);
  }
}

export async function deletePost(req, res, next) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    const isOwner = post.author.toString() === req.user.id;
    if (!isOwner) {
      if (post.repostOf) {
        const original = await Post.findById(post.repostOf).select("author");
        if (!original || original.author.toString() !== req.user.id) {
          return res.status(403).json({ message: "Forbidden" });
        }
      } else {
        return res.status(403).json({ message: "Forbidden" });
      }
    }
    await Post.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function hidePost(req, res, next) {
  try {
    await User.findByIdAndUpdate(req.user.id, { $addToSet: { hiddenPosts: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function unhidePost(req, res, next) {
  try {
    await User.findByIdAndUpdate(req.user.id, { $pull: { hiddenPosts: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function pinPost(req, res, next) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post || post.author.toString() !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    await User.findByIdAndUpdate(req.user.id, { $addToSet: { pinnedPosts: post._id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function unpinPost(req, res, next) {
  try {
    await User.findByIdAndUpdate(req.user.id, { $pull: { pinnedPosts: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
