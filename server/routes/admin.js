import express from "express";
import { auth } from "../middleware/auth.js";
import User from "../models/User.js";
import Post from "../models/Post.js";
import Clan from "../models/Clan.js";

const router = express.Router();

async function requireAdmin(req, res, next) {
  const me = await User.findById(req.user.id).select("isAdmin");
  if (!me?.isAdmin) return res.status(403).json({ message: "Forbidden" });
  next();
}

router.get("/overview", auth, requireAdmin, async (req, res) => {
  const [users, posts, clans] = await Promise.all([
    User.countDocuments(),
    Post.countDocuments(),
    Clan.countDocuments()
  ]);

  const joinRequests = await Clan.aggregate([
    { $project: { count: { $size: { $ifNull: ["$joinRequests", []] } } } },
    { $group: { _id: null, total: { $sum: "$count" } } }
  ]);

  res.json({
    users,
    posts,
    clans,
    joinRequests: joinRequests[0]?.total || 0
  });
});

router.get("/users", auth, requireAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const users = await User.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("username userTag email isAdmin clan clanRole createdAt");
  res.json({ users });
});

router.get("/posts", auth, requireAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const posts = await Post.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("author", "username userTag");
  res.json({ posts });
});

router.get("/clans", auth, requireAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const clans = await Clan.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("leader", "username userTag")
    .select("name leader isPrivate createdAt joinRequests");
  res.json({ clans });
});

router.delete("/users/:id", auth, requireAdmin, async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

router.delete("/posts/:id", auth, requireAdmin, async (req, res) => {
  await Post.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

router.delete("/clans/:id", auth, requireAdmin, async (req, res) => {
  await Clan.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

router.post("/users/:id/admin", auth, requireAdmin, async (req, res) => {
  const { isAdmin } = req.body;
  const user = await User.findByIdAndUpdate(req.params.id, { isAdmin: !!isAdmin }, { new: true })
    .select("username userTag isAdmin");
  res.json({ user });
});

export default router;
