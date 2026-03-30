// server/models/Report.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ReportSchema = new Schema({
    studyLocationId: {
        type: Schema.Types.ObjectId,
        ref: 'StudyLocation', // Links to the specific spot being reported on
        required: true
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User', // Links to the user who made the report
        required: true
    },
    deviceId: {
        type: String
    },
    noiseLevel: {
        type: String, // e.g., "Silent", "Moderate", "Loud"
        required: true
    },
    occupancyLevel: {
        type: String, // e.g., "Empty", "Moderate", "Full"
        required: true
    },
    decibelAverage: {
        type: Number // Stored as a float
    },
    decibelMax: {
        type: Number // Stored as a float
    }
}, { 
    timestamps: { createdAt: true, updatedAt: false } // Reports are created but not updated
});

module.exports = mongoose.model('Report', ReportSchema);
