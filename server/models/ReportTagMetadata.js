const mongoose = require("mongoose");

const { Schema } = mongoose;

const reportTagMetadataSchema = new Schema(
  {
    reportId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      ref: "Report",
    },
    decayFactor: {
      type: Number,
      required: true,
      min: 0,
    },
    varianceCorrectionWF: {
      type: Number,
      required: true,
      min: 0,
    },
    sessionCorrectionNoiseWF: {
      type: Number,
      required: true,
      min: 0,
    },
    noiseWeightFactor: {
      type: Number,
      required: true,
      min: 0,
    },
    occupancyWeightFactor: {
      type: Number,
      required: true,
      min: 0,
    },
    lastEvaluatedAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

module.exports =
  mongoose.models.ReportTagMetadata ||
  mongoose.model("ReportTagMetadata", reportTagMetadataSchema);
