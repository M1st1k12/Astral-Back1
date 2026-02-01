import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";

export async function createConversation(req, res, next) {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: "userId required" });

    const me = await User.findById(req.user.id).select("blockedUsers");
    const other = await User.findById(userId).select("blockedUsers");
    if (me?.blockedUsers?.some((id) => id.toString() === userId)) {
      return res.status(403).json({ message: "User is blocked" });
    }
    if (other?.blockedUsers?.some((id) => id.toString() === req.user.id)) {
      return res.status(403).json({ message: "You are blocked" });
    }

    const existing = await Conversation.findOne({
      participants: { $all: [req.user.id, userId] },
      $expr: { $eq: [{ $size: "$participants" }, 2] }
    });

    if (existing) {
      const convo = await Conversation.findById(existing._id)
        .populate("participants", "username avatar status lastSeen")
        .populate("lastMessage");
      return res.json({ conversation: convo });
    }

    const convo = await Conversation.create({ participants: [req.user.id, userId] });
    const populated = await Conversation.findById(convo._id)
      .populate("participants", "username avatar status lastSeen")
      .populate("lastMessage");

    res.status(201).json({ conversation: populated });
  } catch (err) {
    next(err);
  }
}

export async function getConversations(req, res, next) {
  try {
    const me = await User.findById(req.user.id).select("blockedUsers");
    const conversations = await Conversation.find({ participants: req.user.id })
      .sort({ updatedAt: -1 })
      .populate("participants", "username avatar status lastSeen")
      .populate("lastMessage");

    const blocked = new Set((me?.blockedUsers || []).map((id) => id.toString()));
    const filtered = [];
    for (const c of conversations) {
      const other = c.participants.find((p) => p._id.toString() !== req.user.id);
      if (!other) continue;
      if (blocked.has(other._id.toString())) continue;
      const otherUser = await User.findById(other._id).select("blockedUsers");
      const otherBlocked = new Set((otherUser?.blockedUsers || []).map((id) => id.toString()));
      if (otherBlocked.has(req.user.id)) continue;
      filtered.push(c);
    }

    res.json({ conversations: filtered });
  } catch (err) {
    next(err);
  }
}

export async function deleteConversation(req, res, next) {
  try {
    const convo = await Conversation.findById(req.params.id);
    if (!convo || !convo.participants.some((p) => p.toString() === req.user.id)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    await Message.deleteMany({ conversation: convo._id });
    await Conversation.findByIdAndDelete(convo._id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
