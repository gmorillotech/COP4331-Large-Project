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
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
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
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      index: true,
    },
    accountStatus: {
      type: String,
      enum: ["active", "forced_reset", "suspended"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

userSchema.methods.getProfile = function () {
  return {
    userId: this.userId,
    login: this.login,
    email: this.email,
    firstName: this.firstName,
    lastName: this.lastName,
    displayName: this.displayName,
    favorites: this.favorites,
    userNoiseWF: this.userNoiseWF,
    userOccupancyWF: this.userOccupancyWF,
    createdAt: this.createdAt,
  };
};

userSchema.methods.updateProfile = function (updates) {
  if (updates.firstName !== undefined) this.firstName = updates.firstName;
  if (updates.lastName !== undefined) this.lastName = updates.lastName;
  if (updates.displayName !== undefined) this.displayName = updates.displayName;
  if (updates.favorites !== undefined) this.favorites = updates.favorites;
  if (updates.userNoiseWF !== undefined) this.userNoiseWF = updates.userNoiseWF;
  if (updates.userOccupancyWF !== undefined) this.userOccupancyWF = updates.userOccupancyWF;
  return this.save();
};

userSchema.methods.verifyEmail = function () {
  this.emailVerifiedAt = new Date();
  this.emailVerificationToken = null;
  return this.save();
};

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
