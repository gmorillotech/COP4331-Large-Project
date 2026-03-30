const express = require('express');
const Report = require('../models/Report');
const { protect } = require('../middleware/authMiddleware');
const router = express.Router();

// ALL report routes are protected
router.use(protect);

// 1. POST /api/reports
router.post('/', async (req, res) => {
    try {
        const { studyLocationId, noiseLevel, occupancyLevel, decibelAverage, decibelMax } = req.body;
        const newReport = new Report({
            studyLocationId,
            noiseLevel,
            occupancyLevel,
            decibelAverage,
            decibelMax,
            userId: req.user._id
        });
        const savedReport = await newReport.save();
        // TODO: Trigger logic to update the associated StudyLocation's status
        res.status(201).json(savedReport);
    } catch (error) {
        res.status(500).json({ error: 'Server error while creating report.' });
    }
});

// 2. GET /api/reports/location/:locationId
router.get('/location/:locationId', async (req, res) => {
    try {
        const reports = await Report.find({ studyLocationId: req.params.locationId })
            .sort({ createdAt: -1 })
            .limit(20);
        res.status(200).json(reports);
    } catch (error) {
        res.status(500).json({ error: 'Server error fetching reports.' });
    }
});

// 3. GET /api/reports/recent
router.get('/recent', async (req, res) => {
    try {
        const reports = await Report.find()
            .populate('studyLocationId', 'name')
            .populate('userId', 'firstName lastName')
            .sort({ createdAt: -1 })
            .limit(15);
        res.status(200).json(reports);
    } catch (error) {
        res.status(500).json({ error: 'Server error fetching recent reports.' });
    }
});

module.exports = router;