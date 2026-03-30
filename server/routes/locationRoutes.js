const express = require('express');
const LocationGroup = require('../models/LocationGroup');
const StudyLocation = require('../models/StudyLocation');
const router = express.Router();

// 1. GET /api/locations/groups
router.get('/groups', async (req, res) => {
    try {
        const groups = await LocationGroup.find();
        res.status(200).json(groups);
    } catch (error) {
        res.status(500).json({ error: 'Server error fetching location groups.' });
    }
});

// 2. GET /api/locations/groups/:groupId/locations
router.get('/groups/:groupId/locations', async (req, res) => {
    try {
        const locations = await StudyLocation.find({ locationGroupId: req.params.groupId });
        if (!locations) {
            return res.status(404).json({ error: 'No locations found for this group.' });
        }
        res.status(200).json(locations);
    } catch (error) {
        res.status(500).json({ error: 'Server error fetching study locations.' });
    }
});

// 3. GET /api/locations/:locationId
router.get('/:locationId', async (req, res) => {
    try {
        const location = await StudyLocation.findById(req.params.locationId).populate('locationGroupId', 'name');
        if (!location) {
            return res.status(404).json({ error: 'Location not found.' });
        }
        res.status(200).json(location);
    } catch (error) {
        res.status(500).json({ error: 'Server error fetching location details.' });
    }
});

// 4. GET /api/locations/closest?lat=...&lng=...
router.get('/closest', async (req, res) => {
    
    // Added a '2dsphere' index on the 'coordinates' field in Database in MongoDB.
    try {
        const { lat, lng } = req.query;
        if (!lat || !lng) {
            return res.status(400).json({ error: 'Latitude and longitude query parameters are required.' });
        }
        const locations = await StudyLocation.find({
            coordinates: {
                $near: {
                    $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
                    $maxDistance: 5000 // Finds locations within a 5 kilometer radius
                }
            }
        }).limit(10);
        res.status(200).json(locations);
    } catch (error) {
        res.status(500).json({ error: 'Server error finding closest locations.' });
    }
});

module.exports = router;