const crypto = require("crypto");
const nodemailer = require("nodemailer");

const User = require("../models/User");
const Report = require("../models/Report");
const AuditLog = require("../models/AuditLog");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function serializeUserForAdmin(user) {
  return {
    userId: user.userId,
    displayName:
      user.displayName ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.login,
    email: user.email,
    trustScore: user.userOccupancyWF,
    role: user.role,
    accountStatus: user.accountStatus,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
  };
}

function snapshotUser(user) {
  return {
    userId: user.userId,
    login: user.login,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    role: user.role,
    accountStatus: user.accountStatus,
    userOccupancyWF: user.userOccupancyWF,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
  };
}

async function writeAuditLog({ adminUserId, actionType, targetType, targetId, beforeSnapshot, afterSnapshot }) {
  const entry = new AuditLog({
    auditId: crypto.randomUUID(),
    adminUserId,
    actionType,
    targetType,
    targetId,
    beforeSnapshot: beforeSnapshot || undefined,
    afterSnapshot: afterSnapshot || undefined,
  });
  await entry.save();
}

// ── LIST USERS ───────────────────────────────────────
async function listUsers(queryTerm) {
  let filter = {};
  if (queryTerm) {
    const regex = new RegExp(escapeRegex(queryTerm), "i");
    filter = {
      $or: [
        { displayName: regex },
        { firstName: regex },
        { lastName: regex },
        { login: regex },
        { email: regex },
      ],
    };
  }

  const users = await User.find({ ...filter, userId: { $exists: true, $ne: null } })
    .select("-passwordHash -passwordResetToken -passwordResetExpiresAt -emailVerificationToken")
    .sort({ createdAt: -1 });

  return users.map(serializeUserForAdmin);
}

// ── EDIT USER ────────────────────────────────────────
async function editUser(userId, updates, adminUserId) {
  const user = await User.findOne({ userId });
  if (!user) {
    return { error: "User not found", status: 404 };
  }

  const beforeSnap = snapshotUser(user);

  if (updates.email !== undefined) {
    if (!EMAIL_REGEX.test(updates.email)) {
      return { error: "Invalid email format", status: 400 };
    }
    const normalizedEmail = updates.email.trim().toLowerCase();
    const existing = await User.findOne({
      email: normalizedEmail,
      userId: { $ne: userId },
    });
    if (existing) {
      return { error: "Email already taken", status: 409 };
    }
    user.email = normalizedEmail;
  }

  if (updates.userOccupancyWF !== undefined) {
    const val = Number(updates.userOccupancyWF);
    if (!Number.isFinite(val) || val < 0 || val > 10) {
      return { error: "userOccupancyWF must be a number between 0 and 10", status: 400 };
    }
    user.userOccupancyWF = val;
  }

  if (updates.role !== undefined) {
    if (!["user", "admin"].includes(updates.role)) {
      return { error: "role must be 'user' or 'admin'", status: 400 };
    }
    user.role = updates.role;
  }

  if (updates.accountStatus !== undefined) {
    if (!["active", "forced_reset", "suspended"].includes(updates.accountStatus)) {
      return { error: "accountStatus must be 'active', 'forced_reset', or 'suspended'", status: 400 };
    }
    user.accountStatus = updates.accountStatus;
  }

  await user.save();
  const afterSnap = snapshotUser(user);

  const auditWrites = [];
  const auditBase = { adminUserId, targetType: "user", targetId: userId, beforeSnapshot: beforeSnap, afterSnapshot: afterSnap };

  if (updates.email !== undefined) {
    auditWrites.push(writeAuditLog({ ...auditBase, actionType: "user_email_edit" }));
  }
  if (updates.userOccupancyWF !== undefined) {
    auditWrites.push(writeAuditLog({ ...auditBase, actionType: "trust_score_change" }));
  }
  if (updates.role !== undefined || updates.accountStatus !== undefined) {
    auditWrites.push(writeAuditLog({ ...auditBase, actionType: "user_edit" }));
  }

  await Promise.all(auditWrites);

  return { user: serializeUserForAdmin(user) };
}

// ── FORCE PASSWORD RESET ─────────────────────────────
async function forcePasswordReset(userId, adminUserId) {
  const user = await User.findOne({ userId });
  if (!user) {
    return { error: "User not found", status: 404 };
  }

  user.passwordChangedAt = new Date();
  user.emailVerifiedAt = null;
  user.emailVerificationToken = crypto.randomBytes(32).toString("hex");
  user.accountStatus = "forced_reset";
  await user.save();

  if (process.env.FRONTEND_URL && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    const verificationLink = `${process.env.FRONTEND_URL}/verify?token=${user.emailVerificationToken}`;
    try {
      await transporter.sendMail({
        to: user.email,
        from: `Meta Location <${process.env.EMAIL_USER}>`,
        subject: "Password Reset Required",
        html: `<p>An administrator has required you to reset your password. Please click this link to verify your account and set a new password: <a href="${verificationLink}">${verificationLink}</a></p>`,
      });
    } catch (mailError) {
      console.error("Failed to send forced password reset email:", mailError.message);
    }
  }

  await writeAuditLog({
    adminUserId,
    actionType: "force_password_reset",
    targetType: "user",
    targetId: userId,
  });

  return { userId };
}

// ── DELETE USER ──────────────────────────────────────
async function deleteUser(userId, adminUserId) {
  const user = await User.findOne({ userId });
  if (!user) {
    return { error: "User not found", status: 404 };
  }

  if (adminUserId === userId) {
    return { error: "Cannot delete your own account", status: 400 };
  }

  const beforeSnap = snapshotUser(user);

  await Report.deleteMany({ userId, reportKind: "live" });
  await User.deleteOne({ userId });

  await writeAuditLog({
    adminUserId,
    actionType: "user_delete",
    targetType: "user",
    targetId: userId,
    beforeSnapshot: beforeSnap,
  });

  return { userId };
}

module.exports = {
  listUsers,
  editUser,
  forcePasswordReset,
  deleteUser,
};
