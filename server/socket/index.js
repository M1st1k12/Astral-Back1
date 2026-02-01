import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Message from "../models/Message.js";

export function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
      credentials: true
    }
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Unauthorized"));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch (err) {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.userId;

    await User.findByIdAndUpdate(userId, {
      status: "online",
      lastSeen: new Date()
    });

    socket.join(userId.toString());
    io.emit("presence:update", { userId, status: "online" });

    socket.on("conversation:join", (conversationId) => {
      socket.join(conversationId);
    });

    socket.on("conversation:leave", (conversationId) => {
      socket.leave(conversationId);
    });

    socket.on("typing", ({ conversationId, isTyping }) => {
      socket.to(conversationId).emit("typing", { conversationId, userId, isTyping });
    });

    socket.on("message:seen", async ({ messageIds, conversationId }) => {
      if (!Array.isArray(messageIds) || messageIds.length === 0) return;
      await Message.updateMany(
        { _id: { $in: messageIds } },
        { $set: { seen: true } }
      );
      io.to(conversationId).emit("message:seen", { messageIds, conversationId, userId });
    });

    socket.on("disconnect", async () => {
      await User.findByIdAndUpdate(userId, {
        status: "offline",
        lastSeen: new Date()
      });
      io.emit("presence:update", { userId, status: "offline" });
    });
  });

  return io;
}
