
const mongoose = require("mongoose");

const StudyLocationSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
        },
        locationGroupId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "LocationGroup",
            required: true,
        },
        coordinates: {
            type: [Number],
            required: true,
            validate: {
                validator: function (val){
                    return Array.isArray(val) && val.length === 2;
                },
                message: "Coordinates must be [latitude, longitude]",
            },
        },
        preciseLocation: {
            type: String,
            default: "",
            trim: true,
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

module.exports = mongoose.model("StudyLocation", StudyLocationSchema);