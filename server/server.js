import http from "http";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import postRoutes from "./routes/posts.js";
import conversationRoutes from "./routes/conversations.js";
import messageRoutes from "./routes/messages.js";
import notificationRoutes from "./routes/notifications.js";
import searchRoutes from "./routes/search.js";
import adminRoutes from "./routes/admin.js";
import { initSocket } from "./socket/index.js";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = initSocket(server);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const CLIENT_ORIGINS = [
  "https://astralstarmessenger.netlify.app",
  "https://6981132707b74505fcfa3297--astralstarmessenger.netlify.app",
  "http://localhost:5173"
];

app.set("io", io);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (CLIENT_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"), false);
  },
  credentials: true
}));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/posts", postRoutes);
app.use("/conversations", conversationRoutes);
app.use("/messages", messageRoutes);
app.use("/notifications", notificationRoutes);
app.use("/search", searchRoutes);
app.use("/admin", adminRoutes);

app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ message: err.message || "Server error" });
});

async function start() {
  if (!MONGO_URI) {
    console.error("Missing MONGO_URI in env");
    process.exit(1);
  }
  await mongoose.connect(MONGO_URI);
  console.log("MongoDB connected");
  server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
}

start();
