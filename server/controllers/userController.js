import User from "../models/User.js";
import Notification from "../models/Notification.js";
import Clan from "../models/Clan.js";

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function emitNotification(io, notification) {
  const populated = await Notification.findById(notification._id)
    .populate("from", "username avatar")
    .populate("post", "content mediaUrl mediaType");
  io.to(notification.user.toString()).emit("notification:new", populated);
}

export async function searchUsers(req, res, next) {
  try {
    const q = (req.query.query || "").trim();
    if (!q) return res.json({ users: [] });
    const users = await User.find({
      $or: [
        { username: { $regex: q, $options: "i" } },
        { userTag: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } }
      ]
    }).select("username userTag email avatar status lastSeen bio followers following clan clanRole");
    res.json({ users });
  } catch (err) {
    next(err);
  }
}

export async function getUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id).select(
      "username userTag email avatar status lastSeen bio followers following clan clanRole isPrivate cover pinnedPosts"
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    const isFollowing = user.followers.some((id) => id.toString() === req.user.id);
    res.json({ user, isFollowing });
  } catch (err) {
    next(err);
  }
}

export async function getClan(req, res, next) {
  try {
    const name = (req.params.name || "").trim();
    if (!name) return res.status(400).json({ message: "Clan name required" });

    const members = await User.find({
      clan: { $regex: `^${escapeRegex(name)}$`, $options: "i" }
    })
      .sort({ createdAt: 1 })
      .select("username userTag avatar status lastSeen bio followers following clan clanRole createdAt");

    const clanName = members[0]?.clan || name;
    const count = members.length;
    const isConstellation = count >= 5;

    let clanDoc = await Clan.findOne({ name: new RegExp(`^${escapeRegex(clanName)}$`, "i") })
      .populate("leader", "username avatar")
      .populate("joinRequests.user", "username avatar userTag");

    if (!clanDoc && members.length > 0) {
      clanDoc = await Clan.create({
        name: clanName,
        leader: members[0]._id
      });
      clanDoc = await Clan.findById(clanDoc._id).populate("leader", "username avatar");
      await User.findByIdAndUpdate(members[0]._id, { clanRole: "leader" });
    }

    if (clanDoc && !clanDoc.leader && members.length > 0) {
      clanDoc.leader = members[0]._id;
      await clanDoc.save();
      clanDoc = await Clan.findById(clanDoc._id).populate("leader", "username avatar");
      await User.findByIdAndUpdate(members[0]._id, { clanRole: "leader" });
    }

    const leader = clanDoc?.leader || members[0] || null;
    if (leader && leader._id && leader._id.toString() === req.user.id) {
      await User.findByIdAndUpdate(leader._id, { clanRole: "leader" });
    }
    const isLeader = leader ? leader._id.toString() === req.user.id : false;
    const canManage = isLeader || members.some((m) => m._id.toString() === req.user.id && m.clanRole === "officer");

    res.json({
      clan: clanName,
      members,
      count,
      isConstellation,
      needed: Math.max(0, 5 - count),
      leader: leader
        ? { _id: leader._id, username: leader.username, avatar: leader.avatar }
        : null,
      motto: clanDoc?.motto || "",
      announcement: clanDoc?.announcement || "",
      isLeader,
      isPrivate: clanDoc?.isPrivate || false,
      joinRequests: canManage ? clanDoc?.joinRequests || [] : []
    });
  } catch (err) {
    next(err);
  }
}

export async function updateClan(req, res, next) {
  try {
    const name = (req.params.name || "").trim();
    if (!name) return res.status(400).json({ message: "Clan name required" });

    let clanDoc = await Clan.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, "i") });
    if (!clanDoc) return res.status(404).json({ message: "Clan not found" });

    if (!clanDoc.leader) {
      const members = await User.find({
        clan: { $regex: `^${escapeRegex(name)}$`, $options: "i" }
      })
        .sort({ createdAt: 1 })
        .select("_id");
      if (members[0]) {
        clanDoc.leader = members[0]._id;
        await clanDoc.save();
      }
    }

    if (!clanDoc.leader || clanDoc.leader.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only leader can update clan" });
    }

    const motto = (req.body.motto || "").toString().trim().slice(0, 120);
    const announcement = (req.body.announcement || "").toString().trim().slice(0, 500);
    const isPrivate = typeof req.body.isPrivate === "boolean" ? req.body.isPrivate : clanDoc.isPrivate;

    clanDoc.motto = motto;
    clanDoc.announcement = announcement;
    clanDoc.isPrivate = isPrivate;
    await clanDoc.save();

    res.json({
      clan: clanDoc.name,
      motto: clanDoc.motto,
      announcement: clanDoc.announcement,
      isPrivate: clanDoc.isPrivate
    });
  } catch (err) {
    next(err);
  }
}

export async function updateClanRole(req, res, next) {
  try {
    const name = (req.params.name || "").trim();
    const memberId = req.params.id;
    const role = (req.body.role || "").toString();
    if (!name || !memberId) return res.status(400).json({ message: "Invalid request" });
    if (!["officer", "member"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const clanDoc = await Clan.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, "i") });
    if (!clanDoc) return res.status(404).json({ message: "Clan not found" });

    if (!clanDoc.leader || clanDoc.leader.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only leader can update roles" });
    }

    if (clanDoc.leader.toString() === memberId) {
      return res.status(400).json({ message: "Leader role cannot be changed" });
    }

    const member = await User.findById(memberId).select("clan clanRole");
    if (!member) return res.status(404).json({ message: "User not found" });
    if (!member.clan || member.clan.toLowerCase() !== name.toLowerCase()) {
      return res.status(400).json({ message: "User is not in this clan" });
    }

    member.clanRole = role;
    await member.save();

    res.json({ ok: true, role });
  } catch (err) {
    next(err);
  }
}

export async function requestJoinClan(req, res, next) {
  try {
    const name = (req.params.name || "").trim();
    if (!name) return res.status(400).json({ message: "Clan name required" });
    const me = await User.findById(req.user.id).select("clan");
    if (me?.clan) return res.status(400).json({ message: "Already in a clan" });

    const clanDoc = await Clan.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, "i") });
    if (!clanDoc) return res.status(404).json({ message: "Clan not found" });

    if (!clanDoc.isPrivate) {
      me.clan = clanDoc.name;
      me.clanRole = "member";
      await me.save();
      return res.json({ ok: true, joined: true });
    }

    const exists = clanDoc.joinRequests?.some((r) => r.user?.toString() === req.user.id);
    if (exists) return res.status(400).json({ message: "Request already sent" });

    clanDoc.joinRequests.push({ user: req.user.id });
    await clanDoc.save();
    res.json({ ok: true, requested: true });
  } catch (err) {
    next(err);
  }
}

export async function listJoinRequests(req, res, next) {
  try {
    const name = (req.params.name || "").trim();
    if (!name) return res.status(400).json({ message: "Clan name required" });
    const clanDoc = await Clan.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, "i") })
      .populate("joinRequests.user", "username avatar userTag")
      .select("leader joinRequests");
    if (!clanDoc) return res.status(404).json({ message: "Clan not found" });
    const isLeader = clanDoc.leader && clanDoc.leader.toString() === req.user.id;
    const me = await User.findById(req.user.id).select("clanRole");
    const canManage = isLeader || me?.clanRole === "officer";
    if (!canManage) return res.status(403).json({ message: "Forbidden" });
    res.json({ requests: clanDoc.joinRequests || [] });
  } catch (err) {
    next(err);
  }
}

export async function approveJoinRequest(req, res, next) {
  try {
    const name = (req.params.name || "").trim();
    const requestId = req.params.id;
    if (!name || !requestId) return res.status(400).json({ message: "Invalid request" });

    const clanDoc = await Clan.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, "i") });
    if (!clanDoc) return res.status(404).json({ message: "Clan not found" });
    const isLeader = clanDoc.leader && clanDoc.leader.toString() === req.user.id;
    const me = await User.findById(req.user.id).select("clanRole");
    const canManage = isLeader || me?.clanRole === "officer";
    if (!canManage) return res.status(403).json({ message: "Forbidden" });

    const reqEntry = clanDoc.joinRequests.id(requestId);
    if (!reqEntry) return res.status(404).json({ message: "Request not found" });

    const target = await User.findById(reqEntry.user).select("clan");
    if (target?.clan) {
      clanDoc.joinRequests = clanDoc.joinRequests.filter((r) => r._id.toString() !== requestId);
      await clanDoc.save();
      return res.json({ ok: true });
    }

    await User.findByIdAndUpdate(reqEntry.user, { clan: clanDoc.name, clanRole: "member" });
    clanDoc.joinRequests = clanDoc.joinRequests.filter((r) => r._id.toString() !== requestId);
    await clanDoc.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function denyJoinRequest(req, res, next) {
  try {
    const name = (req.params.name || "").trim();
    const requestId = req.params.id;
    if (!name || !requestId) return res.status(400).json({ message: "Invalid request" });
    const clanDoc = await Clan.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, "i") }).select("leader joinRequests");
    if (!clanDoc) return res.status(404).json({ message: "Clan not found" });
    const isLeader = clanDoc.leader && clanDoc.leader.toString() === req.user.id;
    const me = await User.findById(req.user.id).select("clanRole");
    const canManage = isLeader || me?.clanRole === "officer";
    if (!canManage) return res.status(403).json({ message: "Forbidden" });
    clanDoc.joinRequests = clanDoc.joinRequests.filter((r) => r._id.toString() !== requestId);
    await clanDoc.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function leaveClan(req, res, next) {
  try {
    const me = await User.findById(req.user.id).select("clan clanRole");
    if (!me || !me.clan) return res.status(400).json({ message: "You are not in a clan" });

    const clanDoc = await Clan.findOne({ name: new RegExp(`^${escapeRegex(me.clan)}$`, "i") });
    const membersCount = await User.countDocuments({
      clan: { $regex: `^${escapeRegex(me.clan)}$`, $options: "i" }
    });

    if (clanDoc?.leader && clanDoc.leader.toString() === req.user.id && membersCount > 1) {
      return res.status(400).json({ message: "Leader must transfer leadership before leaving" });
    }

    if (clanDoc?.leader && clanDoc.leader.toString() === req.user.id && membersCount <= 1) {
      await Clan.deleteOne({ _id: clanDoc._id });
    }

    me.clan = "";
    me.clanRole = "";
    await me.save();

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function inviteToClan(req, res, next) {
  try {
    const name = (req.params.name || "").trim();
    const username = (req.body.username || "").trim();
    if (!name || !username) return res.status(400).json({ message: "Invalid request" });

    const inviter = await User.findById(req.user.id).select("clan clanRole");
    if (!inviter || !inviter.clan || inviter.clan.toLowerCase() !== name.toLowerCase()) {
      return res.status(403).json({ message: "Not in this clan" });
    }
    const clanDoc = await Clan.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, "i") }).select("leader");
    const isLeader = clanDoc?.leader && clanDoc.leader.toString() === req.user.id;
    if (!isLeader && !["leader", "officer"].includes(inviter.clanRole)) {
      return res.status(403).json({ message: "Only leader or officer can invite" });
    }

    const target = await User.findOne({ userTag: username.toLowerCase() }).select("clan clanInvites userTag");
    if (!target) return res.status(404).json({ message: "User not found" });
    if (target.clan) return res.status(400).json({ message: "User already in a clan" });

    const already = target.clanInvites?.some((i) => i.clan.toLowerCase() === name.toLowerCase());
    if (already) return res.status(400).json({ message: "Invite already sent" });

    target.clanInvites.push({ clan: name, from: req.user.id });
    await target.save();

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function listClanInvites(req, res, next) {
  try {
    const me = await User.findById(req.user.id)
      .populate("clanInvites.from", "username avatar")
      .select("clanInvites");
    res.json({ invites: me.clanInvites || [] });
  } catch (err) {
    next(err);
  }
}

export async function acceptClanInvite(req, res, next) {
  try {
    const inviteId = req.params.id;
    const me = await User.findById(req.user.id).select("clan clanRole clanInvites");
    if (!me) return res.status(404).json({ message: "User not found" });
    if (me.clan) return res.status(400).json({ message: "Already in a clan" });

    const invite = me.clanInvites.id(inviteId);
    if (!invite) return res.status(404).json({ message: "Invite not found" });

    me.clan = invite.clan;
    me.clanRole = "member";
    me.clanInvites = me.clanInvites.filter((i) => i._id.toString() !== inviteId);
    await me.save();

    res.json({ ok: true, clan: me.clan, clanRole: me.clanRole });
  } catch (err) {
    next(err);
  }
}

export async function denyClanInvite(req, res, next) {
  try {
    const inviteId = req.params.id;
    const me = await User.findById(req.user.id).select("clanInvites");
    if (!me) return res.status(404).json({ message: "User not found" });
    me.clanInvites = me.clanInvites.filter((i) => i._id.toString() !== inviteId);
    await me.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function kickClanMember(req, res, next) {
  try {
    const name = (req.params.name || "").trim();
    const memberId = req.params.id;
    if (!name || !memberId) return res.status(400).json({ message: "Invalid request" });

    const clanDoc = await Clan.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, "i") });
    if (!clanDoc) return res.status(404).json({ message: "Clan not found" });

    if (!clanDoc.leader || clanDoc.leader.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only leader can kick members" });
    }

    if (clanDoc.leader.toString() === memberId) {
      return res.status(400).json({ message: "Leader cannot be kicked" });
    }

    const member = await User.findById(memberId).select("clan");
    if (!member) return res.status(404).json({ message: "User not found" });
    if (!member.clan || member.clan.toLowerCase() !== name.toLowerCase()) {
      return res.status(400).json({ message: "User is not in this clan" });
    }

    member.clan = "";
    member.clanRole = "";
    await member.save();

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function updateAvatar(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const avatarUrl = `/uploads/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { avatar: avatarUrl },
      { new: true }
    ).select("username userTag email avatar status lastSeen bio followers following clan clanRole isPrivate cover pinnedPosts");
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

export async function updateCover(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const coverUrl = `/uploads/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { cover: coverUrl },
      { new: true }
    ).select("username userTag email avatar status lastSeen bio followers following clan clanRole isPrivate cover pinnedPosts");
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const { username, userTag, bio, isPrivate, clan } = req.body;
    const existing = await User.findById(req.user.id).select("clan clanRole userTag");
    const update = { username, bio, isPrivate, clan };
    if (userTag && userTag !== existing.userTag) {
      const taken = await User.findOne({ userTag });
      if (taken) return res.status(400).json({ message: "Username already in use" });
      update.userTag = userTag;
    }
    if (existing?.clan !== clan) {
      if (!clan) {
        update.clanRole = "";
      } else {
        update.clanRole = "member";
      }
    }
    const user = await User.findByIdAndUpdate(req.user.id, update, { new: true }).select(
      "username userTag email avatar status lastSeen bio followers following clan clanRole isPrivate cover pinnedPosts"
    );
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

export async function followUser(req, res, next) {
  try {
    const targetId = req.params.id;
    if (targetId === req.user.id) return res.status(400).json({ message: "Cannot follow yourself" });

    const target = await User.findById(targetId).select("isPrivate");
    if (!target) return res.status(404).json({ message: "User not found" });

    if (target.isPrivate) {
      await User.findByIdAndUpdate(targetId, { $addToSet: { followRequests: req.user.id } });
      const notification = await Notification.create({
        user: targetId,
        from: req.user.id,
        type: "follow_request"
      });
      await emitNotification(req.app.get("io"), notification);
      return res.json({ requested: true });
    }

    await User.findByIdAndUpdate(targetId, { $addToSet: { followers: req.user.id } });
    await User.findByIdAndUpdate(req.user.id, { $addToSet: { following: targetId } });

    const notification = await Notification.create({
      user: targetId,
      from: req.user.id,
      type: "follow"
    });
    await emitNotification(req.app.get("io"), notification);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function unfollowUser(req, res, next) {
  try {
    const targetId = req.params.id;
    await User.findByIdAndUpdate(targetId, { $pull: { followers: req.user.id } });
    await User.findByIdAndUpdate(req.user.id, { $pull: { following: targetId } });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function approveFollow(req, res, next) {
  try {
    const requesterId = req.params.id;
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { followRequests: requesterId },
      $addToSet: { followers: requesterId }
    });
    await User.findByIdAndUpdate(requesterId, { $addToSet: { following: req.user.id } });

    const notification = await Notification.create({
      user: requesterId,
      from: req.user.id,
      type: "follow_approved"
    });
    await emitNotification(req.app.get("io"), notification);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function denyFollow(req, res, next) {
  try {
    const requesterId = req.params.id;
    await User.findByIdAndUpdate(req.user.id, { $pull: { followRequests: requesterId } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function listFollowRequests(req, res, next) {
  try {
    const me = await User.findById(req.user.id)
      .populate("followRequests", "username avatar");
    res.json({ requests: me.followRequests || [] });
  } catch (err) {
    next(err);
  }
}

export async function getBookmarks(req, res, next) {
  try {
    const me = await User.findById(req.user.id)
      .populate({
        path: "bookmarks",
        populate: { path: "author", select: "username avatar clan" }
      });
    res.json({ posts: me.bookmarks || [] });
  } catch (err) {
    next(err);
  }
}

export async function getHidden(req, res, next) {
  try {
    const me = await User.findById(req.user.id)
      .populate({
        path: "hiddenPosts",
        populate: { path: "author", select: "username avatar clan" }
      });
    res.json({ posts: me.hiddenPosts || [] });
  } catch (err) {
    next(err);
  }
}

export async function muteUser(req, res, next) {
  try {
    await User.findByIdAndUpdate(req.user.id, { $addToSet: { mutedUsers: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function unmuteUser(req, res, next) {
  try {
    await User.findByIdAndUpdate(req.user.id, { $pull: { mutedUsers: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function blockUser(req, res, next) {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ message: "Cannot block yourself" });
    await User.findByIdAndUpdate(req.user.id, { $addToSet: { blockedUsers: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function unblockUser(req, res, next) {
  try {
    await User.findByIdAndUpdate(req.user.id, { $pull: { blockedUsers: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
