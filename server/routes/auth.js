import express from "express";
import { body } from "express-validator";
import { login, me, register } from "../controllers/authController.js";
import { auth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = express.Router();

router.post(
  "/register",
  [
    body("username").isLength({ min: 2 }),
    body("email").isEmail(),
    body("password").isLength({ min: 6 })
  ],
  validate,
  register
);

router.post(
  "/login",
  [body("email").isEmail(), body("password").isLength({ min: 6 })],
  validate,
  login
);

router.get("/me", auth, me);

export default router;
