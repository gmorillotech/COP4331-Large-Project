const mongoose = require("mongoose");

const LocationGroupSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
        },
        description: {
            type: String,
            default: "",
        },
        coordinates: {
            type: [Number],
            defualt: null,
        },
        currNoiseLevel: {
            type: String,
            enum: ["Silent", "Quiet", "Moderate", "Loud"],
            default: "Moderate",
        },
        currOccupancyLevel: {
            type: String,
            enum: ["Empty", "Sparse", "Moderate", "Crowded", "Full"],
            default: "Moderate",
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("LocationGroup", LocationGroupSchema);