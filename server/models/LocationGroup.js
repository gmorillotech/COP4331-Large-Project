// server/models/LocationGroup.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const LocationGroupSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    coordinates: {
    type: [Number], // Stored as [longitude, latitude]
    required: true,
    index: '2dsphere' // You can also define the index directly in the schema
    },
    currNoiseLevel: {
        type: String,
        default: 'Unknown' // Default value until first report
    },
    currOccupancyLevel: {
        type: String,
        default: 'Unknown' // Default value until first report
    }
}, { 
    timestamps: true // This automatically adds createdAt and updatedAt fields
});

module.exports = mongoose.model('LocationGroup', LocationGroupSchema);


