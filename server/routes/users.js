import express from "express";
import { auth } from "../middleware/auth.js";
import upload from "../middleware/upload.js";
import {
  getUser,
  searchUsers,
  updateAvatar,
  updateProfile,
  followUser,
  unfollowUser,
  updateCover,
  muteUser,
  unmuteUser,
  listFollowRequests,
  approveFollow,
  denyFollow,
  getBookmarks,
  getHidden,
  getClan,
  updateClan,
  updateClanRole,
  requestJoinClan,
  listJoinRequests,
  approveJoinRequest,
  denyJoinRequest,
  kickClanMember,
  leaveClan,
  inviteToClan,
  listClanInvites,
  acceptClanInvite,
  denyClanInvite,
  blockUser,
  unblockUser
} from "../controllers/userController.js";

const router = express.Router();

router.get("/search", auth, searchUsers);
router.get("/me/bookmarks", auth, getBookmarks);
router.get("/me/hidden", auth, getHidden);
router.get("/me/follow-requests", auth, listFollowRequests);
router.get("/clan/:name", auth, getClan);
router.put("/clan/:name", auth, updateClan);
router.put("/clan/:name/members/:id/role", auth, updateClanRole);
router.post("/clan/:name/request", auth, requestJoinClan);
router.get("/clan/:name/requests", auth, listJoinRequests);
router.post("/clan/:name/requests/:id/approve", auth, approveJoinRequest);
router.post("/clan/:name/requests/:id/deny", auth, denyJoinRequest);
router.delete("/clan/:name/members/:id", auth, kickClanMember);
router.post("/clan/leave", auth, leaveClan);
router.post("/clan/:name/invite", auth, inviteToClan);
router.get("/me/clan-invites", auth, listClanInvites);
router.post("/clan/invites/:id/accept", auth, acceptClanInvite);
router.post("/clan/invites/:id/deny", auth, denyClanInvite);
router.put("/me/avatar", auth, upload.single("avatar"), updateAvatar);
router.put("/me/cover", auth, upload.single("cover"), updateCover);
router.put("/me", auth, updateProfile);
router.get("/:id", auth, getUser);
router.post("/:id/follow", auth, followUser);
router.post("/:id/unfollow", auth, unfollowUser);
router.post("/:id/approve", auth, approveFollow);
router.post("/:id/deny", auth, denyFollow);
router.post("/:id/mute", auth, muteUser);
router.post("/:id/unmute", auth, unmuteUser);
router.post("/:id/block", auth, blockUser);
router.post("/:id/unblock", auth, unblockUser);

export default router;
