const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { verifyTokenMiddleware } = require("../middlewares/jwtVerifier");
const { body, header, validationResult } = require('express-validator');
const User = require("../models/User");

// Login route with validation
router.post("/login", [
  body("name").notEmpty().withMessage("Name is required"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("role").notEmpty().withMessage("Role is required")
], async (req, res) => {
  // Validate request inputs
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { name, email, role } = req.body;

    let user = await User.findOne({ email });
    if (!user) {
      // Create a new user object
      user = new User({
        name,
        email,
        role,
      });
    }

    const iat = Math.floor(Date.now() / 1000);

    const token = jwt.sign(
      { userId: user._id, iat: iat },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    user.tokens = user.tokens.concat({ token });
    await user.save();

    return res.status(200).json({
      token,
      message: "Logged in Successfully!",
      uid: user._id,
      role: user.role,
    });
  } catch (error) {
    return res.status(500).json({ message: `Oops! An error occurred: ${error}` });
  }
});

// Logout route with validation
router.post("/logout", [
  header("token").notEmpty().withMessage("Token is required"),
  header("user-id").notEmpty().withMessage("User ID is required")
], verifyTokenMiddleware, async (req, res) => {
  // Validate request inputs
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const token = req.headers.token;
    const userId = req.headers["user-id"];

    const user = await User.findOne({ _id: userId });
    if (!user) return res.status(400).json({ message: "Unauthorized access" });

    user.tokens = user.tokens.filter((t) => t.token !== token);
    await user.save();

    return res.status(200).json({ message: "Logged Out Successfully!" });
  } catch (error) {
    return res.status(500).json({ message: `Oops! An error occurred: ${error}` });
  }
});

// Logout-all route with validation
router.post("/logout-all", [
  header("user-id").notEmpty().withMessage("User ID is required")
], verifyTokenMiddleware, async (req, res) => {
  // Validate request inputs
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const userId = req.headers["user-id"];

    const user = await User.findOne({ _id: userId });
    if (!user) return res.status(400).json({ message: "Unauthorized access" });

    user.tokens = [];
    await user.save();

    return res.status(200).json({ message: "Logged Out (All Devices)!" });
  } catch (error) {
    return res.status(500).json({ message: `Oops! An error occurred: ${error}` });
  }
});

module.exports = router;
