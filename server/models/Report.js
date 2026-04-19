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

// Last-resort diagnostic: log every Report deletion with its filter + the
// user-code caller stack. Reports have been vanishing at 22 min without
// hitting any of the tracked delete paths (A1 stale, admin delete, admin
// user delete, group delete). Catching every invocation at the model layer
// guarantees we see the culprit regardless of whether it's a known path,
// a missed code path, or a direct mongosh/script deletion.
reportSchema.pre(
  ["deleteOne", "deleteMany", "findOneAndDelete"],
  function preDeleteLog() {
    try {
      const filter = this.getFilter?.() || this.getQuery?.() || {};
      const stack = new Error("[Report-delete-trace]").stack
        ?.split("\n")
        .slice(1)
        .map((l) => l.trim())
        .filter((l) => !l.includes("node_modules") && !l.includes("node:internal"))
        .slice(0, 8)
        .join(" | ");
      console.log(
        `[Report-delete] op=${this.op} filter=${JSON.stringify(filter)} stack=${stack}`,
      );
    } catch (err) {
      console.log(`[Report-delete] log hook failed: ${err.message}`);
    }
  },
);

module.exports = mongoose.models.Report || mongoose.model("Report", reportSchema);
