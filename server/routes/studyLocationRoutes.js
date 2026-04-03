const express = require("express");
const router = express.Router();    
const StudyLocation = require("../models/StudyLocation");  
const LocationGroup = require('../models/LocationGroup')
router.get("/locations", async (req, res) => {
    try {
        const locations = await StudyLocation.find();
        const groups =  await LocationGroup.find()
        res.json({
            locations: locations,
            groups: groups
        });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;