const mongoose = require("mongoose");
const bcrypt = require('bcryptjs');

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
  },
  {
    timestamps: true,
    versionKey: false,
  },
);
// Hash password before saving
UserSchema.pre('save', async function () {
    // Only hash the password if it has been modified (or is new)
    if (this.isModified('password')) {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    }
});
module.exports = mongoose.models.User || mongoose.model("User", userSchema);
