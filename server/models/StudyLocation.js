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
      min: 0,
      max: 5,
    },
    updatedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

studyLocationSchema.index({ locationGroupId: 1, name: 1 });
studyLocationSchema.index({ latitude: 1, longitude: 1 });

module.exports =
  mongoose.models.StudyLocation ||
  mongoose.model("StudyLocation", studyLocationSchema);
