import express from "express";
import { auth } from "../middleware/auth.js";
import upload from "../middleware/upload.js";
import { createPost, getFeed, getGlobalFeed, getFollowingFeed, getUserPosts, toggleLike, addComment, repost, toggleBookmark, hidePost, unhidePost, pinPost, unpinPost, deletePost } from "../controllers/postController.js";

const router = express.Router();

router.post("/", auth, upload.single("media"), createPost);
router.get("/feed", auth, getFeed);
router.get("/global", auth, getGlobalFeed);
router.get("/following", auth, getFollowingFeed);
router.get("/user/:id", auth, getUserPosts);
router.post("/:id/like", auth, toggleLike);
router.post("/:id/comment", auth, addComment);
router.post("/:id/repost", auth, repost);
router.post("/:id/bookmark", auth, toggleBookmark);
router.post("/:id/hide", auth, hidePost);
router.post("/:id/unhide", auth, unhidePost);
router.post("/:id/pin", auth, pinPost);
router.post("/:id/unpin", auth, unpinPost);
router.delete("/:id", auth, deletePost);

export default router;
