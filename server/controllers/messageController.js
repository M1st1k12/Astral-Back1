import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";

async function emitNotification(io, notification) {
  const populated = await Notification.findById(notification._id)
    .populate("from", "username avatar")
    .populate("post", "content mediaUrl mediaType");
  io.to(notification.user.toString()).emit("notification:new", populated);
}

export async function sendMessage(req, res, next) {
  try {
    const { conversationId, content, type } = req.body;
    if (!conversationId) return res.status(400).json({ message: "conversationId required" });

    const convo = await Conversation.findById(conversationId);
    if (!convo || !convo.participants.some((p) => p.toString() === req.user.id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const others = convo.participants.filter((p) => p.toString() !== req.user.id);
    const otherUser = await User.findById(others[0]).select("blockedUsers");
    const me = await User.findById(req.user.id).select("blockedUsers");
    if (me?.blockedUsers?.some((id) => id.toString() === others[0].toString())) {
      return res.status(403).json({ message: "User is blocked" });
    }
    if (otherUser?.blockedUsers?.some((id) => id.toString() === req.user.id)) {
      return res.status(403).json({ message: "You are blocked" });
    }

    let messageType = type || "text";
    let messageContent = content || "";
    let fileUrl = "";
    let fileName = "";
    let fileSize = 0;

    if (req.file) {
      fileUrl = `/uploads/${req.file.filename}`;
      fileName = req.file.originalname;
      fileSize = req.file.size;
      messageType = req.file.mimetype.startsWith("image/") ? "image" : "file";
      messageContent = messageContent || fileName;
    }

    const message = await Message.create({
      sender: req.user.id,
      conversation: conversationId,
      content: messageContent,
      type: messageType,
      fileUrl,
      fileName,
      fileSize
    });

    await Conversation.findByIdAndUpdate(conversationId, { lastMessage: message._id });

    const populated = await Message.findById(message._id).populate(
      "sender",
      "username email avatar"
    );

    const io = req.app.get("io");
    io.to(conversationId).emit("message:new", populated);

    const recipients = convo.participants.filter((p) => p.toString() !== req.user.id);
    for (const userId of recipients) {
      const notification = await Notification.create({
        user: userId,
        from: req.user.id,
        type: "message"
      });
      await emitNotification(io, notification);
    }

    res.status(201).json({ message: populated });
  } catch (err) {
    next(err);
  }
}

export async function getMessages(req, res, next) {
  try {
    const { conversationId } = req.params;
    const convo = await Conversation.findById(conversationId);
    if (!convo || !convo.participants.some((p) => p.toString() === req.user.id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const messages = await Message.find({ conversation: conversationId })
      .sort({ createdAt: 1 })
      .populate("sender", "username email avatar");
    res.json({ messages });
  } catch (err) {
    next(err);
  }
}

export async function editMessage(req, res, next) {
  try {
    const { content } = req.body;
    const message = await Message.findOneAndUpdate(
      { _id: req.params.id, sender: req.user.id },
      { content, editedAt: new Date() },
      { new: true }
    ).populate("sender", "username email avatar");

    if (!message) return res.status(404).json({ message: "Message not found" });

    const io = req.app.get("io");
    io.to(message.conversation.toString()).emit("message:edit", message);

    res.json({ message });
  } catch (err) {
    next(err);
  }
}

export async function deleteMessage(req, res, next) {
  try {
    const message = await Message.findOneAndUpdate(
      { _id: req.params.id, sender: req.user.id },
      { deletedAt: new Date(), content: "", fileUrl: "", fileName: "", fileSize: 0 },
      { new: true }
    );
    if (!message) return res.status(404).json({ message: "Message not found" });

    const io = req.app.get("io");
    io.to(message.conversation.toString()).emit("message:delete", { id: message._id });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function reactMessage(req, res, next) {
  try {
    const { emoji } = req.body;
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ message: "Message not found" });

    const exists = message.reactions.find(
      (r) => r.user.toString() === req.user.id && r.emoji === emoji
    );
    if (exists) {
      message.reactions = message.reactions.filter(
        (r) => !(r.user.toString() === req.user.id && r.emoji === emoji)
      );
    } else {
      message.reactions.push({ emoji, user: req.user.id });
    }
    await message.save();

    const io = req.app.get("io");
    io.to(message.conversation.toString()).emit("message:reaction", { id: message._id, reactions: message.reactions });

    res.json({ reactions: message.reactions });
  } catch (err) {
    next(err);
  }
}
