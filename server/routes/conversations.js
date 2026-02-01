import express from "express";
import { auth } from "../middleware/auth.js";
import { createConversation, getConversations, deleteConversation } from "../controllers/conversationController.js";

const router = express.Router();

router.post("/create", auth, createConversation);
router.get("/", auth, getConversations);
router.delete("/:id", auth, deleteConversation);

export default router;
