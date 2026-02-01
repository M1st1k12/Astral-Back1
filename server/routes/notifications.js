import express from "express";
import { auth } from "../middleware/auth.js";
import { listNotifications, markAllRead } from "../controllers/notificationController.js";

const router = express.Router();

router.get("/", auth, listNotifications);
router.post("/read", auth, markAllRead);

export default router;
