
require("dotenv").config();
const mongoose = require("mongoose");

const connectDB = require("./config/db");

const LocationGroup = require("./models/LocationGroup");
const StudyLocation = require("./models/StudyLocation");

const seedData = async () => {
    try {
        await connectDB(); 

        await LocationGroup.deleteMany();
        await StudyLocation.deleteMany();

        console.log("Old data cleared.");

        const groups = await LocationGroup.insertMany([
            {
                name: "Library",
                description: "Main campus library",
                coordinates: [28.6031, -81.2008],
                currNoiseLevel: "Silent",
                currOccupancyLevel: "Moderate",
            },
            {
                name: "Student Union",
                description: "Food and social area",
                coordinates: [28.6018, -81.1995],
                currNoiseLevel: "Loud",
                currOccupancyLevel: "Crowded",
            },
        ]);

        console.log("LocationGroups added.");

        await StudyLocation.insertMany([
            {
                name: "Library 4th Floor Quiet Zone",
                locationGroupId: groups[0]._id,
                coordinates: [28.6032, -81.2009],
                preciseLocation: "4th floor, near the windows",
                currNoiseLevel: "Silent",
                currOccupancyLevel: "Sparse",
            },
            {
                name: "Student Union Food Court",
                locationGroupId: groups[1]._id,
                coordinates: [28.6019, -81.1996],
                preciseLocation: "Food court area",
                currNoiseLevel: "Loud",
                currOccupancyLevel: "Full",
            },
        ]);

        console.log("StudyLocations added.");

        process.exit();
    }catch (err) {
        console.error(error);
        process.exit(1);
    }
};

seedData();