import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

function signToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

export async function register(req, res, next) {
  try {
    const { username, userTag, email, password } = req.body;
    const existing = await User.findOne({ $or: [{ email }, { userTag }] });
    if (existing?.email === email) return res.status(400).json({ message: "Email already in use" });
    if (existing?.userTag === userTag) return res.status(400).json({ message: "Username already in use" });
    if (!userTag) return res.status(400).json({ message: "Username is required" });
    const hashed = await bcrypt.hash(password, 10);
    const isAdmin =
      (userTag || "").toLowerCase() === "sashka" &&
      (email || "").toLowerCase() === "sanec228poltawec@gmail.com";
    const user = await User.create({ username, userTag, email, password: hashed, isAdmin });
    const token = signToken(user._id);
    res.status(201).json({ token, user: user.toJSON() });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid credentials" });
    if (
      (user.userTag || "").toLowerCase() === "sashka" &&
      (user.email || "").toLowerCase() === "sanec228poltawec@gmail.com" &&
      !user.isAdmin
    ) {
      user.isAdmin = true;
      await user.save();
    }
    const token = signToken(user._id);
    res.json({ token, user: user.toJSON() });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (
      (user.userTag || "").toLowerCase() === "sashka" &&
      (user.email || "").toLowerCase() === "sanec228poltawec@gmail.com" &&
      !user.isAdmin
    ) {
      user.isAdmin = true;
      await user.save();
    }
    res.json({ user: user.toJSON() });
  } catch (err) {
    next(err);
  }
}
