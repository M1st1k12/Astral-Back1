import express from "express";
import { auth } from "../middleware/auth.js";
import upload from "../middleware/upload.js";
import { getMessages, sendMessage, editMessage, deleteMessage, reactMessage } from "../controllers/messageController.js";

const router = express.Router();

router.post("/", auth, upload.single("file"), sendMessage);
router.get("/:conversationId", auth, getMessages);
router.patch("/:id", auth, editMessage);
router.delete("/:id", auth, deleteMessage);
router.post("/:id/react", auth, reactMessage);

export default router;
