const mongoose = require("mongoose");

const CardSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    card: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Cards", CardSchema);