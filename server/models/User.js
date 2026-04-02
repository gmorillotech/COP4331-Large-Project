const mongoose = require("mongoose");

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    login: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    firstName: {
      type: String,
      trim: true,
      default: null,
    },
    lastName: {
      type: String,
      trim: true,
      default: null,
    },
    displayName: {
      type: String,
      trim: true,
      default: null,
    },
    hideLocation: {
      type: Boolean,
      required: true,
      default: false,
    },
    pinColor: {
      type: String,
      trim: true,
      default: "#0F766E",
    },
    favorites: {
      type: [String],
      default: [],
    },
    userNoiseWF: {
      type: Number,
      required: true,
      default: 1,
      min: 0,
    },
    userOccupancyWF: {
      type: Number,
      required: true,
      default: 1,
      min: 0,
    },
    emailVerificationToken: {
      type: String,
      default: null,
      index: true,
    },
    emailVerifiedAt: {
      type: Date,
      default: null,
    },
    passwordResetToken: {
      type: String,
      default: null,
      index: true,
    },
    passwordResetExpiresAt: {
      type: Date,
      default: null,
    },
    passwordChangedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
