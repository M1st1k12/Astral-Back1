import Notification from "../models/Notification.js";

export async function listNotifications(req, res, next) {
  try {
    const notifications = await Notification.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("from", "username avatar")
      .populate("post", "content mediaUrl mediaType");
    res.json({ notifications });
  } catch (err) {
    next(err);
  }
}

export async function markAllRead(req, res, next) {
  try {
    await Notification.updateMany({ user: req.user.id }, { $set: { read: true } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
