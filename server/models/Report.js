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
      required: true,
      index: true,
      trim: true,
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
      required: true,
      min: 0,
    },
    variance: {
      type: Number,
      required: true,
      min: 0,
    },
    occupancy: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

reportSchema.index({ studyLocationId: 1, createdAt: -1 });
reportSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.models.Report || mongoose.model("Report", reportSchema);
