require("dotenv").config();

const connectDB = require("./config/db");

const LocationGroup = require("./models/LocationGroup");
const StudyLocation = require("./models/StudyLocation");
const { locationGroups, studyLocations } = require("./services/locationCatalog");

const seedData = async () => {
  try {
    await connectDB();

    await LocationGroup.deleteMany();
    await StudyLocation.deleteMany();

    console.log("Old data cleared.");

    await LocationGroup.insertMany(
      locationGroups.map((group) => ({
        locationGroupId: group.locationGroupId,
        name: group.name,
        currentNoiseLevel: null,
        currentOccupancyLevel: null,
        updatedAt: null,
      })),
    );

    console.log("LocationGroups added.");

    await StudyLocation.insertMany(
      studyLocations.map((location) => ({
        studyLocationId: location.studyLocationId,
        name: location.name,
        locationGroupId: location.locationGroupId,
        floorLabel: location.floorLabel,
        sublocationLabel: location.sublocationLabel,
        latitude: location.latitude,
        longitude: location.longitude,
        currentNoiseLevel: null,
        currentOccupancyLevel: null,
        updatedAt: null,
      })),
    );

    console.log("StudyLocations added.");

    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

seedData();
