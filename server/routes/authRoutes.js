const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");
const tokenService = require("../createJWT");

const router = express.Router();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

router.post("/register", async (req, res) => {
  try {
    const { firstName, lastName, displayName, login, email, password } = req.body ?? {};
    if (!login || !email || !password) {
      return res.status(400).json({ error: "Please provide login, email, and password." });
    }

    const normalizedLogin = login.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({
      $or: [{ login: normalizedLogin }, { email: normalizedEmail }],
    });

    if (existingUser) {
      return res.status(409).json({ error: "An account with that login or email already exists." });
    }

    const emailVerificationToken = crypto.randomBytes(32).toString("hex");
    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = new User({
      userId: crypto.randomUUID(),
      login: normalizedLogin,
      email: normalizedEmail,
      passwordHash,
      firstName: firstName ?? null,
      lastName: lastName ?? null,
      displayName: displayName ?? null,
      favorites: [],
      userNoiseWF: 1,
      userOccupancyWF: 1,
      emailVerificationToken,
      emailVerifiedAt: null,
    });

    await newUser.save();

    if (process.env.FRONTEND_URL && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const verificationLink =
        `${process.env.FRONTEND_URL}/verify?token=${emailVerificationToken}`;
      await transporter.sendMail({
        to: normalizedEmail,
        from: `Meta Location <${process.env.EMAIL_USER}>`,
        subject: "Verify Your Account",
        html: `<p>Welcome! Please click this link to verify your account: <a href="${verificationLink}">${verificationLink}</a></p>`,
      });
    }

    return res.status(201).json({
      userId: newUser.userId,
      login: newUser.login,
      email: newUser.email,
      message: "Registration successful. Please verify your email before logging in.",
    });
  } catch (error) {
    return res.status(500).json({
      error: "Server error during registration.",
      details: error.message,
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { login, password } = req.body ?? {};
    if (!login || !password) {
      return res.status(400).json({ error: "Missing login or password" });
    }

    const normalizedLogin = login.trim().toLowerCase();
    const user = await User.findOne({ login: normalizedLogin });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    if (!user.emailVerifiedAt) {
      return res.status(403).json({ error: "Please verify your email before logging in." });
    }

    const token = tokenService.createToken(user.firstName, user.lastName, user.userId);
    return res.status(200).json({
      accessToken: token.accessToken,
      user: {
        userId: user.userId,
        login: user.login,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        favorites: user.favorites,
        userNoiseWF: user.userNoiseWF,
        userOccupancyWF: user.userOccupancyWF,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Server error during login." });
  }
});

router.post("/verify-email", async (req, res) => {
  try {
    const { token } = req.body ?? {};
    const user = await User.findOne({ emailVerificationToken: token });
    if (!user) {
      return res.status(400).json({ error: "Invalid or expired verification token." });
    }

    user.emailVerifiedAt = new Date();
    user.emailVerificationToken = null;
    await user.save();
    return res.status(200).json({ message: "Email verified successfully. You can now log in." });
  } catch (error) {
    return res.status(500).json({ error: "Server error during email verification." });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body ?? {};
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const user = normalizedEmail ? await User.findOne({ email: normalizedEmail }) : null;

    if (!user) {
      return res.status(200).json({
        message: "If an account with that email exists, a password reset link has been sent.",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.passwordResetToken = resetToken;
    user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    if (process.env.FRONTEND_URL && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
      await transporter.sendMail({
        to: user.email,
        from: `Meta Location <${process.env.EMAIL_USER}>`,
        subject: "Password Reset Request",
        html: `<p>You requested a password reset. Click this link to continue: <a href="${resetLink}">${resetLink}</a>. This link will expire in one hour.</p>`,
      });
    }

    return res.status(200).json({
      message: "If an account with that email exists, a password reset link has been sent.",
    });
  } catch (error) {
    return res.status(500).json({ error: "Server error." });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body ?? {};
    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpiresAt: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ error: "Password reset token is invalid or has expired." });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordResetToken = null;
    user.passwordResetExpiresAt = null;
    await user.save();

    return res.status(200).json({ message: "Password has been successfully reset." });
  } catch (error) {
    return res.status(500).json({ error: "Server error." });
  }
});

router.get("/profile", protect, (req, res) => {
  return res.status(200).json(req.user);
});

router.put("/profile", protect, async (req, res) => {
  try {
    const { firstName, lastName, displayName, favorites } = req.body ?? {};
    const user = await User.findOne({ userId: req.user.userId });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (displayName !== undefined) user.displayName = displayName;
    if (favorites !== undefined && Array.isArray(favorites)) user.favorites = favorites;

    const updatedUser = await user.save();
    return res.status(200).json({
      userId: updatedUser.userId,
      login: updatedUser.login,
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      displayName: updatedUser.displayName,
      favorites: updatedUser.favorites,
      userNoiseWF: updatedUser.userNoiseWF,
      userOccupancyWF: updatedUser.userOccupancyWF,
    });
  } catch (error) {
    return res.status(500).json({ error: "Server error while updating profile." });
  }
});

router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(400).json({ error: "User not found." });

    if (user.emailVerifiedAt) return res.status(400).json({ error: "Account already verified." });

    const token = crypto.randomBytes(32).toString("hex");
    user.emailVerificationToken = token;
    await user.save();

    const verificationLink = `${process.env.FRONTEND_URL}/verify?token=${token}`;

    await transporter.sendMail({
      to: user.email,
      from: `Meta Location <${process.env.EMAIL_USER}>`,
      subject: "Verify Your Account",
      html: `<p>Click here to verify your account: <a href="${verificationLink}">${verificationLink}</a></p>`,
    });

    return res.json({ message: "Verification email resent." });
  } catch (err) {
    return res.status(500).json({ error: "Server error." });
  }
});

module.exports = router;
