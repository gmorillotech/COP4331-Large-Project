const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

const User = require("../models/User");
const tokenService = require("../createJWT");

const DEFAULT_PIN_COLOR = "#0F766E";

function normalizeDisplayName(displayName) {
  if (displayName === null) return null;
  if (displayName === undefined) return undefined;
  const trimmed = String(displayName).trim();
  if (!trimmed) return "";
  return trimmed;
}

function normalizePinColor(pinColor) {
  if (pinColor === undefined) return undefined;
  const trimmed = String(pinColor).trim();
  return /^#([A-Fa-f0-9]{6})$/.test(trimmed) ? trimmed.toUpperCase() : "";
}

function serializeUser(user) {
  return {
    userId: user.userId,
    login: user.login,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    hideLocation: Boolean(user.hideLocation),
    pinColor: user.pinColor || DEFAULT_PIN_COLOR,
    favorites: user.favorites,
    userNoiseWF: user.userNoiseWF,
    userOccupancyWF: user.userOccupancyWF,
    role: user.role,
    accountStatus: user.accountStatus,
    passwordChangedAt: user.passwordChangedAt,
    createdAt: user.createdAt,
  };
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ── REGISTER ─────────────────────────────────────────
const register = async (req, res) => {
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
      hideLocation: false,
      pinColor: DEFAULT_PIN_COLOR,
      favorites: [],
      userNoiseWF: 1,
      userOccupancyWF: 1,
      emailVerificationToken,
      emailVerifiedAt: null,
      passwordChangedAt: new Date(),
    });

    await newUser.save();

    if (process.env.FRONTEND_URL && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const verificationLink = `${process.env.FRONTEND_URL}/verify?token=${emailVerificationToken}`;
      try {
        await transporter.sendMail({
          to: normalizedEmail,
          from: `Meta Location <${process.env.EMAIL_USER}>`,
          subject: "Verify Your Account",
          html: `<p>Welcome! Please click this link to verify your account: <a href="${verificationLink}">${verificationLink}</a></p>`,
        });
      } catch (mailError) {
        console.error("Failed to send verification email during registration:", mailError.message);
      }
    }

    return res.status(201).json({
      userId: newUser.userId,
      login: newUser.login,
      email: newUser.email,
      message: "Registration successful. Please verify your email before logging in.",
    });
  } catch (error) {
    return res.status(500).json({ error: "Server error during registration.", details: error.message });
  }
};

// ── LOGIN ─────────────────────────────────────────────
const login = async (req, res) => {
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
      user: serializeUser(user),
    });
  } catch (error) {
    return res.status(500).json({ error: "Server error during login." });
  }
};

// ── VERIFY EMAIL ──────────────────────────────────────
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body ?? {};
    const user = await User.findOne({ emailVerificationToken: token });
    if (!user) {
      return res.status(400).json({ error: "Invalid or expired verification token." });
    }

    await user.verifyEmail();
    return res.status(200).json({ message: "Email verified successfully. You can now log in." });
  } catch (error) {
    return res.status(500).json({ error: "Server error during email verification." });
  }
};

// ── RESEND VERIFICATION ───────────────────────────────
const resendVerification = async (req, res) => {
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
    try {
      await transporter.sendMail({
        to: user.email,
        from: `Meta Location <${process.env.EMAIL_USER}>`,
        subject: "Verify Your Account",
        html: `<p>Click here to verify your account: <a href="${verificationLink}">${verificationLink}</a></p>`,
      });
    } catch (mailError) {
      console.error("Failed to send verification email:", mailError.message);
      return res.status(500).json({ error: "Unable to send verification email. Please try again later." });
    }

    return res.json({ message: "Verification email resent." });
  } catch (error) {
    return res.status(500).json({ error: "Server error." });
  }
};

// ── FORGOT PASSWORD ───────────────────────────────────
const forgotPassword = async (req, res) => {
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

    try {
      await transporter.sendMail({
        to: user.email,
        from: `Meta Location <${process.env.EMAIL_USER}>`,
        subject: "Password Reset Request",
        html: `<p>You requested a password reset. Click this link to continue: <a href="${process.env.FRONTEND_URL}/reset-password?token=${resetToken}">${process.env.FRONTEND_URL}/reset-password?token=${resetToken}</a></p><p>This link will expire in one hour.</p>`,
      });
    } catch (mailError) {
      console.error("Failed to send password reset email:", mailError.message);
    }

    return res.status(200).json({
      message: "If an account with that email exists, a password reset link has been sent.",
    });
  } catch (error) {
    return res.status(500).json({ error: "Server error.", details: error.message });
  }
};

// ── RESET PASSWORD ────────────────────────────────────
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body ?? {};

    const trimmedNewPassword = String(newPassword || "").trim();
    if (trimmedNewPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters long." });
    }

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpiresAt: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ error: "Password reset token is invalid or has expired." });
    }

    user.passwordHash = await bcrypt.hash(trimmedNewPassword, 10);
    user.passwordResetToken = null;
    user.passwordResetExpiresAt = null;
    user.passwordChangedAt = new Date();
    await user.save();

    return res.status(200).json({ message: "Password has been successfully reset." });
  } catch (error) {
    return res.status(500).json({ error: "Server error." });
  }
};

// ── GET PROFILE ───────────────────────────────────────
const getProfile = async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.user.userId });
    if (!user) return res.status(404).json({ error: "User not found." });
    return res.status(200).json(serializeUser(user));
  } catch (error) {
    return res.status(500).json({ error: "Server error while fetching profile." });
  }
};

// ── UPDATE PROFILE ────────────────────────────────────
const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, displayName, hideLocation, pinColor, favorites } = req.body ?? {};
    const user = await User.findOne({ userId: req.user.userId });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const normalizedDisplayName = normalizeDisplayName(displayName);
    if (normalizedDisplayName === "") {
      return res.status(400).json({ error: "Display name can't be empty." });
    }

    const normalizedPinColor = normalizePinColor(pinColor);
    if (normalizedPinColor === "") {
      return res.status(400).json({ error: "Pin color must be a valid 6-digit hex value." });
    }

    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (normalizedDisplayName !== undefined) user.displayName = normalizedDisplayName;
    if (hideLocation !== undefined) user.hideLocation = Boolean(hideLocation);
    if (normalizedPinColor !== undefined) user.pinColor = normalizedPinColor;
    if (favorites !== undefined && Array.isArray(favorites)) user.favorites = favorites;

    const updatedUser = await user.save();
    return res.status(200).json(serializeUser(updatedUser));
  } catch (error) {
    return res.status(500).json({ error: "Server error while updating profile." });
  }
};

// ── CHANGE PASSWORD ───────────────────────────────────
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current password and new password are required." });
    }

    const trimmedNewPassword = String(newPassword).trim();
    if (trimmedNewPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters long." });
    }

    const user = await User.findOne({ userId: req.user.userId });
    if (!user) return res.status(404).json({ error: "User not found" });

    const passwordMatches = await bcrypt.compare(String(currentPassword), user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    user.passwordHash = await bcrypt.hash(trimmedNewPassword, 10);
    user.passwordChangedAt = new Date();
    await user.save();

    return res.status(200).json({ message: "Password updated successfully." });
  } catch (error) {
    return res.status(500).json({ error: "Server error while updating password." });
  }
};

module.exports = {
  register,
  login,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile,
  changePassword,
};