const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const sgMail = require("@sendgrid/mail");

const User = require("../models/User");
const tokenService = require("../createJWT");
const { SERVER_RUNTIME_CONFIG } = require("../config/runtimeConfig");

const DEFAULT_PIN_COLOR = "#0F766E";
const CODE_TTL_MS = SERVER_RUNTIME_CONFIG.auth.verificationCodeTtlMs;
const CODE_TTL_MINUTES = Math.round(CODE_TTL_MS / 60_000);
const VERIFICATION_CODE_DIGITS = SERVER_RUNTIME_CONFIG.auth.verificationCodeDigits;
const CODE_MIN = 10 ** (VERIFICATION_CODE_DIGITS - 1);
const CODE_RANGE = 9 * CODE_MIN;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sendgridConfigured =
  typeof process.env.SENDGRID_API_KEY === "string" &&
  process.env.SENDGRID_API_KEY.startsWith("SG.") &&
  typeof process.env.EMAIL_FROM === "string" &&
  process.env.EMAIL_FROM.trim().length > 0;

if (sendgridConfigured) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

function normalizeDisplayName(displayName) {
  if (displayName === null) return null;
  if (displayName === undefined) return undefined;
  const trimmed = String(displayName).trim();
  return trimmed ? trimmed : "";
}

function normalizePinColor(pinColor) {
  if (pinColor === undefined) return undefined;
  const trimmed = String(pinColor).trim();
  return /^#([A-Fa-f0-9]{6})$/.test(trimmed) ? trimmed.toUpperCase() : "";
}

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function generateSixDigitCode() {
  return Math.floor(CODE_MIN + Math.random() * CODE_RANGE).toString();
}

function maskEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  const atIndex = normalizedEmail.indexOf("@");
  if (atIndex <= 0) {
    return normalizedEmail;
  }

  const localPart = normalizedEmail.slice(0, atIndex);
  const domain = normalizedEmail.slice(atIndex + 1);
  const visiblePart = localPart.slice(0, 2);
  const maskedPart = "*".repeat(Math.max(0, localPart.length - visiblePart.length));
  return `${visiblePart}${maskedPart}@${domain}`;
}

async function sendCodeEmail({ to, subject, intro, code }) {
  if (!sendgridConfigured) {
    console.warn(`Skipping email "${subject}" because SendGrid is not configured.`);
    return;
  }

  await sgMail.send({
    to,
    from: process.env.EMAIL_FROM,
    subject,
    html: `<p>${intro}</p><p><strong style="font-size:24px;">${code}</strong></p><p>This code expires in ${CODE_TTL_MINUTES} minutes.</p>`,
  });
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

const register = async (req, res) => {
  try {
    const { firstName, lastName, displayName, login, email, password } = req.body ?? {};
    if (!login || !email || !password) {
      return res.status(400).json({ error: "Please provide login, email, and password." });
    }

    const normalizedLogin = String(login).trim().toLowerCase();
    const normalizedEmail = normalizeEmail(email);
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ error: "Please provide a valid email address." });
    }

    const existingUser = await User.findOne({
      $or: [{ login: normalizedLogin }, { email: normalizedEmail }],
    });
    if (existingUser) {
      return res.status(409).json({ error: "An account with that login or email already exists." });
    }

    const emailVerificationCode = generateSixDigitCode();
    const emailVerificationExpiresAt = new Date(Date.now() + CODE_TTL_MS);
    const passwordHash = await bcrypt.hash(String(password), 10);

    const newUser = new User({
      userId: crypto.randomUUID(),
      login: normalizedLogin,
      email: normalizedEmail,
      passwordHash,
      role: "user",
      accountStatus: "active",
      firstName: firstName ?? null,
      lastName: lastName ?? null,
      displayName: displayName ?? null,
      hideLocation: false,
      pinColor: DEFAULT_PIN_COLOR,
      favorites: [],
      userNoiseWF: 1,
      userOccupancyWF: 1,
      emailVerificationCode,
      emailVerificationExpiresAt,
      emailVerifiedAt: null,
      passwordChangedAt: new Date(),
    });

    await newUser.save();

    try {
      await sendCodeEmail({
        to: normalizedEmail,
        subject: "Your StudySpot Verification Code",
        intro: "Welcome to StudySpot. Your verification code is:",
        code: emailVerificationCode,
      });
    } catch (mailError) {
      console.error("Failed to send verification email during registration:", mailError.message);
    }

    return res.status(201).json({
      userId: newUser.userId,
      login: newUser.login,
      email: newUser.email,
      maskedEmail: maskEmail(newUser.email),
      message: "Registration successful. Please check your email for a verification code.",
    });
  } catch (error) {
    return res.status(500).json({ error: "Server error during registration.", details: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { login, password } = req.body ?? {};
    if (!login || !password) {
      return res.status(400).json({ error: "Missing login or password." });
    }

    const normalizedLogin = String(login).trim().toLowerCase();
    const user = await User.findOne({ login: normalizedLogin });
    if (!user || !(await bcrypt.compare(String(password), user.passwordHash))) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    if (user.accountStatus === "suspended") {
      return res.status(403).json({ error: "This account is suspended. Please contact an administrator." });
    }

    if (!user.emailVerifiedAt) {
      return res.status(403).json({
        reason: user.accountStatus === "forced_reset" ? "forced_reset_verify" : "email_not_verified",
        email: user.email,
        maskedEmail: maskEmail(user.email),
        error: user.accountStatus === "forced_reset"
          ? "Verify your email to continue resetting your password."
          : "Please verify your email before logging in.",
      });
    }

    if (user.accountStatus === "forced_reset") {
      return res.status(403).json({
        reason: "forced_reset",
        email: user.email,
        maskedEmail: maskEmail(user.email),
        error: "A password reset is required for this account. Use the reset code sent to your email before logging in.",
      });
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

const verifyEmail = async (req, res) => {
  try {
    const { email, code } = req.body ?? {};
    if (!email || !code) {
      return res.status(400).json({ error: "Email and verification code are required." });
    }

    const submittedCode = String(code).trim();
    const user = await User.findOne({
      email: normalizeEmail(email),
      emailVerificationCode: submittedCode,
      emailVerificationExpiresAt: { $gt: new Date() },
    });
    if (!user) {
      return res.status(400).json({ error: "Invalid or expired verification code." });
    }

    const requiresPasswordReset = user.accountStatus === "forced_reset";
    if (requiresPasswordReset) {
      user.passwordResetCode = submittedCode;
      user.passwordResetCodeExpiresAt = new Date(Date.now() + CODE_TTL_MS);
    }

    const verifiedEmail = user.email;
    await user.verifyEmail();
    return res.status(200).json({
      message: requiresPasswordReset
        ? "Email verified. Set a new password to continue."
        : "Email verified successfully. You can now log in.",
      requiresPasswordReset,
      email: verifiedEmail,
      maskedEmail: maskEmail(verifiedEmail),
    });
  } catch (error) {
    return res.status(500).json({ error: "Server error during email verification." });
  }
};

const resendVerification = async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body?.email);
    if (!normalizedEmail) {
      return res.status(400).json({ error: "Email is required." });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ error: "User not found." });
    }
    if (user.emailVerifiedAt) {
      return res.status(400).json({ error: "Account already verified." });
    }

    const emailVerificationCode = generateSixDigitCode();
    user.emailVerificationCode = emailVerificationCode;
    user.emailVerificationExpiresAt = new Date(Date.now() + CODE_TTL_MS);
    await user.save();

    try {
      await sendCodeEmail({
        to: user.email,
        subject: "Your StudySpot Verification Code",
        intro: "Your new verification code is:",
        code: emailVerificationCode,
      });
    } catch (mailError) {
      console.error("Failed to send verification email:", mailError.message);
      return res.status(500).json({ error: "Unable to send verification code. Please try again later." });
    }

    return res.status(200).json({
      email: user.email,
      maskedEmail: maskEmail(user.email),
      message: "Verification code sent! Check your inbox.",
    });
  } catch (error) {
    return res.status(500).json({ error: "Server error." });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body?.email);
    const normalizedLogin = String(req.body?.login ?? "").trim().toLowerCase();

    let user = null;
    if (normalizedEmail) {
      user = await User.findOne({ email: normalizedEmail });
    } else if (normalizedLogin) {
      user = await User.findOne({ login: normalizedLogin });
    }

    if (!user) {
      return res.status(200).json({
        message: "If an account exists, a reset code has been sent.",
      });
    }

    const resetCode = generateSixDigitCode();
    user.passwordResetCode = resetCode;
    user.passwordResetCodeExpiresAt = new Date(Date.now() + CODE_TTL_MS);
    await user.save();

    try {
      await sendCodeEmail({
        to: user.email,
        subject: "Your StudySpot Password Reset Code",
        intro: "Your password reset code is:",
        code: resetCode,
      });
    } catch (mailError) {
      console.error("Failed to send password reset email:", mailError.message);
    }

    return res.status(200).json({
      email: user.email,
      maskedEmail: maskEmail(user.email),
      message: "If an account exists, a reset code has been sent.",
    });
  } catch (error) {
    return res.status(500).json({ error: "Server error.", details: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body ?? {};
    if (!email || !code) {
      return res.status(400).json({ error: "Email and reset code are required." });
    }

    const trimmedNewPassword = String(newPassword || "").trim();
    if (trimmedNewPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters long." });
    }

    const user = await User.findOne({
      email: normalizeEmail(email),
      passwordResetCode: String(code).trim(),
      passwordResetCodeExpiresAt: { $gt: new Date() },
    });
    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset code." });
    }

    user.passwordResetCode = null;
    user.passwordResetCodeExpiresAt = null;
    user.passwordHash = await bcrypt.hash(trimmedNewPassword, 10);
    user.passwordChangedAt = new Date();
    if (user.accountStatus === "forced_reset") {
      user.accountStatus = "active";
    }
    await user.save();

    return res.status(200).json({ message: "Password has been successfully reset." });
  } catch (error) {
    return res.status(500).json({ error: "Server error." });
  }
};

const getProfile = async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.user.userId });
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    return res.status(200).json(serializeUser(user));
  } catch (error) {
    return res.status(500).json({ error: "Server error while fetching profile." });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, displayName, hideLocation, pinColor, favorites, email } = req.body ?? {};
    const user = await User.findOne({ userId: req.user.userId });
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const normalizedDisplayName = normalizeDisplayName(displayName);
    if (normalizedDisplayName === "") {
      return res.status(400).json({ error: "Display name can't be empty." });
    }

    const normalizedPinColor = normalizePinColor(pinColor);
    if (normalizedPinColor === "") {
      return res.status(400).json({ error: "Pin color must be a valid 6-digit hex value." });
    }

    let verificationCodeToSend = null;

    if (email !== undefined) {
      const normalizedEmail = normalizeEmail(email);
      if (!EMAIL_REGEX.test(normalizedEmail)) {
        return res.status(400).json({ error: "Please provide a valid email address." });
      }

      if (normalizedEmail !== user.email) {
        const existing = await User.findOne({
          email: normalizedEmail,
          userId: { $ne: user.userId },
        });
        if (existing) {
          return res.status(409).json({ error: "That email address is already in use." });
        }

        user.email = normalizedEmail;
        user.emailVerifiedAt = null;
        user.emailVerificationCode = generateSixDigitCode();
        user.emailVerificationExpiresAt = new Date(Date.now() + CODE_TTL_MS);
        verificationCodeToSend = user.emailVerificationCode;
      }
    }

    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (normalizedDisplayName !== undefined) user.displayName = normalizedDisplayName;
    if (hideLocation !== undefined) user.hideLocation = Boolean(hideLocation);
    if (normalizedPinColor !== undefined) user.pinColor = normalizedPinColor;
    if (favorites !== undefined && Array.isArray(favorites)) user.favorites = favorites;

    const updatedUser = await user.save();

    if (verificationCodeToSend) {
      try {
        await sendCodeEmail({
          to: updatedUser.email,
          subject: "Your StudySpot Verification Code",
          intro: "Your email was changed. Your new verification code is:",
          code: verificationCodeToSend,
        });
      } catch (mailError) {
        console.error("Failed to send verification email after profile update:", mailError.message);
      }
    }

    return res.status(200).json(serializeUser(updatedUser));
  } catch (error) {
    return res.status(500).json({ error: "Server error while updating profile." });
  }
};

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
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const passwordMatches = await bcrypt.compare(String(currentPassword), user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    user.passwordHash = await bcrypt.hash(trimmedNewPassword, 10);
    user.passwordChangedAt = new Date();
    if (user.accountStatus === "forced_reset") {
      user.accountStatus = "active";
    }
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
