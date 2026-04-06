const mongoose = require("mongoose");

const { Schema } = mongoose;

const locationGroupSchema = new Schema(
  {
    locationGroupId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    centerLatitude: {
      type: Number,
      default: null,
      min: -90,
      max: 90,
    },
    centerLongitude: {
      type: Number,
      default: null,
      min: -180,
      max: 180,
    },
    radiusMeters: {
      type: Number,
      default: null,
      min: 1,
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
    shapeType: {
      type: String,
      enum: ["circle", "polygon"],
      default: "circle",
    },
    polygon: {
      type: [
        {
          latitude: { type: Number },
          longitude: { type: Number },
        },
      ],
      default: [],
    },
    shapeUpdatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

module.exports =
  mongoose.models.LocationGroup || mongoose.model("LocationGroup", locationGroupSchema);
