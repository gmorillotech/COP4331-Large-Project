const crypto = require("crypto");
const sgMail = require("@sendgrid/mail");

const User = require("../models/User");
const Report = require("../models/Report");
const ReportTagMetadata = require("../models/ReportTagMetadata");
const AuditLog = require("../models/AuditLog");
const { SERVER_RUNTIME_CONFIG } = require("../config/runtimeConfig");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_TTL_MS = SERVER_RUNTIME_CONFIG.auth.verificationCodeTtlMs;
const CODE_TTL_MINUTES = Math.round(CODE_TTL_MS / 60_000);
const sendgridConfigured =
  typeof process.env.SENDGRID_API_KEY === "string" &&
  process.env.SENDGRID_API_KEY.startsWith("SG.") &&
  typeof process.env.EMAIL_FROM === "string" &&
  process.env.EMAIL_FROM.trim().length > 0;

if (sendgridConfigured) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

function generateSixDigitCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendForcedResetCode(email, code) {
  if (!sendgridConfigured) {
    console.warn("Skipping forced password reset email because SendGrid is not configured.");
    return;
  }

  await sgMail.send({
    to: email,
    from: process.env.EMAIL_FROM,
    subject: "Verify Your Account and Reset Your Password",
    html: `<p>An administrator has required you to verify your email again and set a new password.</p><p>Use this 6-digit code when prompted:</p><p><strong style="font-size:24px;">${code}</strong></p><p>This code expires in ${CODE_TTL_MINUTES} minutes.</p>`,
  });
}

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
    .select("-passwordHash -passwordResetCode -passwordResetCodeExpiresAt -emailVerificationCode -emailVerificationExpiresAt")
    .sort({ createdAt: -1 });

  return users.map(serializeUserForAdmin);
}

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
    if (adminUserId === userId) {
      return { error: "You cannot change your own role.", status: 400 };
    }
    user.role = updates.role;
  }

  if (updates.accountStatus !== undefined) {
    if (!["active", "forced_reset", "suspended"].includes(updates.accountStatus)) {
      return { error: "accountStatus must be 'active', 'forced_reset', or 'suspended'", status: 400 };
    }
    if (adminUserId === userId) {
      return { error: "You cannot change your own account status.", status: 400 };
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

async function forcePasswordReset(userId, adminUserId) {
  const user = await User.findOne({ userId });
  if (!user) {
    return { error: "User not found", status: 404 };
  }

  const verificationCode = generateSixDigitCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  user.passwordChangedAt = new Date();
  user.emailVerifiedAt = null;
  user.emailVerificationCode = verificationCode;
  user.emailVerificationExpiresAt = expiresAt;
  user.passwordResetCode = verificationCode;
  user.passwordResetCodeExpiresAt = expiresAt;
  user.accountStatus = "forced_reset";
  await user.save();

  try {
    await sendForcedResetCode(user.email, verificationCode);
  } catch (mailError) {
    console.error("Failed to send forced password reset email:", mailError.message);
  }

  await writeAuditLog({
    adminUserId,
    actionType: "force_password_reset",
    targetType: "user",
    targetId: userId,
  });

  return { userId };
}

async function deleteUser(userId, adminUserId) {
  const user = await User.findOne({ userId });
  if (!user) {
    return { error: "User not found", status: 404 };
  }

  if (adminUserId === userId) {
    return { error: "Cannot delete your own account", status: 400 };
  }

  const beforeSnap = snapshotUser(user);

  // Archive policy: on user deletion, remove ALL reports by the user
  // (both live and archived) to avoid orphaned records referencing a
  // non-existent userId. Aggregates (location/group averages) were
  // derived from these reports historically, but preserving the user's
  // row solely to keep FK-like references is not desired here.
  const userReports = await Report.find({ userId }).select("reportId").lean();
  const reportIds = userReports.map((r) => r.reportId);
  await Promise.all([
    Report.deleteMany({ reportId: { $in: reportIds } }),
    ReportTagMetadata.deleteMany({ reportId: { $in: reportIds } }),
  ]);
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
