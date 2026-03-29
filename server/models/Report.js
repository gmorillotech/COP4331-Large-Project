

const mongoose = require("mongoose");

const ReportSchema = new mongoose.Schema(
    {
        studyLocationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "StudyLocation",
            required: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        deviceId: {
            type: String,
            default: null,
        },
        noiseLevel: {
            type: String,
            enum: ["Silent", "Quiet", "Moderate", "Loud"],
            required: true,
        },
        occupancyLevel: {
            type: String,
            enum: ["Empty", "Sparse", "Moderate", "Crowded", "Full"],
            required: true,
        },
        decibelAverage: {
            type: Number,
            default: null,
        },
        decibelMax: {
            type: Number,
            default: null,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: false }
);

module.exports = mongoose.model("Report", ReportSchema);