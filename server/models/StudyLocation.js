const mongoose = require("mongoose");

const { Schema } = mongoose;

const studyLocationSchema = new Schema(
  {
    studyLocationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    locationGroupId: {
      type: String,
      required: true,
      index: true,
      trim: true,
      ref: "LocationGroup",
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    floorLabel: {
      type: String,
      trim: true,
      default: "",
    },
    sublocationLabel: {
      type: String,
      trim: true,
      default: "",
    },
    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },
    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },
    currentNoiseLevel: {
      type: Number,
      default: null,
      min: 0,
    },
    currentOccupancyLevel: {
      type: Number,
      default: null,
      min: 1,
      max: 5,
    },
    updatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

studyLocationSchema.index({ locationGroupId: 1, name: 1 });
studyLocationSchema.index({ latitude: 1, longitude: 1 });

module.exports =
  mongoose.models.StudyLocation || mongoose.model("StudyLocation", studyLocationSchema);
