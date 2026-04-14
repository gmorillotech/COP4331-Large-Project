const mongoose = require("mongoose");

const { Schema } = mongoose;

const reportSchema = new Schema(
  {
    reportId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    userId: {
      type: String,
      required: false,
      index: true,
      trim: true,
      default: null,
      ref: "User",
    },
    studyLocationId: {
      type: String,
      required: true,
      index: true,
      trim: true,
      ref: "StudyLocation",
    },
    createdAt: {
      type: Date,
      required: true,
      index: true,
    },
    avgNoise: {
      type: Number,
      required: true,
      min: 0,
    },
    maxNoise: {
      type: Number,
      required() {
        return this.reportKind === "live";
      },
      default: null,
      min: 0,
    },
    variance: {
      type: Number,
      required() {
        return this.reportKind === "live";
      },
      default: null,
      min: 0,
    },
    occupancy: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    reportKind: {
      type: String,
      enum: ["live", "archive_summary"],
      default: "live",
      index: true,
    },
    windowStart: {
      type: Date,
      required() {
        return this.reportKind === "archive_summary";
      },
      default: null,
      index: true,
    },
    windowEnd: {
      type: Date,
      required() {
        return this.reportKind === "archive_summary";
      },
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

reportSchema.index({ studyLocationId: 1, createdAt: -1 });
reportSchema.index({ studyLocationId: 1, reportKind: 1, windowStart: 1 });
reportSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.models.Report || mongoose.model("Report", reportSchema);
