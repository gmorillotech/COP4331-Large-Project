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

module.exports =
  mongoose.models.LocationGroup ||
  mongoose.model("LocationGroup", locationGroupSchema);
