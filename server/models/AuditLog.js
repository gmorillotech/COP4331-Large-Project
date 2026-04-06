const mongoose = require("mongoose");
const crypto = require("crypto");

const { Schema } = mongoose;

const auditLogSchema = new Schema(
  {
    auditId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => crypto.randomUUID(),
    },
    adminUserId: {
      type: String,
      required: true,
      index: true,
    },
    actionType: {
      type: String,
      required: true,
      trim: true,
    },
    targetType: {
      type: String,
      required: true,
      trim: true,
    },
    targetId: {
      type: String,
      required: true,
      trim: true,
    },
    beforeSnapshot: {
      type: Schema.Types.Mixed,
      default: null,
    },
    afterSnapshot: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

module.exports =
  mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
