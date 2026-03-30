// server/models/StudyLocation.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const StudyLocationSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    locationGroupId: {
        type: Schema.Types.ObjectId,
        ref: 'LocationGroup', // This creates the link to the LocationGroup model
        required: true
    },
    coordinates: {
        type: [Number], // [longitude, latitude]
        required: true
    },
    preciseLocation: {
        type: String // e.g., "Second floor, near the windows"
    },
    currNoiseLevel: {
        type: String,
        default: 'Unknown'
    },
    currOccupancyLevel: {
        type: String,
        default: 'Unknown'
    }
}, { 
    timestamps: true // This automatically adds createdAt and updatedAt fields
});

module.exports = mongoose.model('StudyLocation', StudyLocationSchema);