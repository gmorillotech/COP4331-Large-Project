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
    description: {
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

// Temporary diagnostic: log every update path that touches
// currentNoiseLevel / currentOccupancyLevel / updatedAt, plus the stack
// that produced it. We've been chasing a ghost writer that blanks the
// card outside of A1's cycle; this will pinpoint the culprit the next
// time it happens. Remove once the source is identified.
studyLocationSchema.pre(["findOneAndUpdate", "updateOne", "updateMany"], function preAggWriteLog() {
  try {
    const update = this.getUpdate() || {};
    const $set = update.$set || update;
    const touchesAggregates =
      Object.prototype.hasOwnProperty.call($set, "currentNoiseLevel") ||
      Object.prototype.hasOwnProperty.call($set, "currentOccupancyLevel") ||
      Object.prototype.hasOwnProperty.call($set, "updatedAt");
    if (!touchesAggregates) return;
    const filter = this.getFilter?.() || this.getQuery?.() || {};
    const stack = new Error("[SL-write-trace]").stack
      ?.split("\n")
      .slice(1, 6)
      .map((line) => line.trim())
      .join(" | ");
    console.log(
      `[SL-write] op=${this.op} filter=${JSON.stringify(filter)} ` +
        `set={noise:${$set.currentNoiseLevel},occ:${$set.currentOccupancyLevel},updatedAt:${$set.updatedAt?.toISOString?.() ?? $set.updatedAt}} ` +
        `stack=${stack}`,
    );
  } catch (err) {
    console.log("[SL-write] log hook failed:", err.message);
  }
});

module.exports =
  mongoose.models.StudyLocation || mongoose.model("StudyLocation", studyLocationSchema);
