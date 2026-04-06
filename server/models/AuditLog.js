const mongoose = require("mongoose");

const { Schema } = mongoose;

const auditLogSchema = new Schema(
  {
    auditId: {
      type: String,
      required: true,
      unique: true,
    },
    adminUserId: {
      type: String,
      required: true,
    },
    actionType: {
      type: String,
      required: true,
    },
    targetType: {
      type: String,
      required: true,
    },
    targetId: {
      type: String,
      required: true,
    },
    beforeSnapshot: {
      type: Schema.Types.Mixed,
    },
    afterSnapshot: {
      type: Schema.Types.Mixed,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  },
);

module.exports =
  mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
