import express from "express";
import { auth } from "../middleware/auth.js";
import Post from "../models/Post.js";
import User from "../models/User.js";

const router = express.Router();

router.get("/", auth, async (req, res, next) => {
  try {
    const q = (req.query.query || "").trim();
    if (!q) return res.json({ users: [], posts: [], hashtags: [] });

    const users = await User.find({ username: { $regex: q, $options: "i" } })
      .select("username avatar clan");

    const posts = await Post.find({ content: { $regex: q, $options: "i" } })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate("author", "username avatar clan");

    const hashtags = await Post.aggregate([
      { $unwind: "$hashtags" },
      { $match: { hashtags: { $regex: q.toLowerCase() } } },
      { $group: { _id: "$hashtags", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({ users, posts, hashtags });
  } catch (err) {
    next(err);
  }
});

export default router;
