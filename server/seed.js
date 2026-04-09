require("dotenv").config();
const bcrypt = require("bcryptjs");

const connectDB = require("./config/db");

const LocationGroup = require("./models/LocationGroup");
const StudyLocation = require("./models/StudyLocation");
const User = require("./models/User");
const { locationGroups, studyLocations } = require("./services/locationCatalog");

const seedData = async () => {
    try {
        await connectDB(); 

        await LocationGroup.deleteMany();
        await StudyLocation.deleteMany();
        await User.deleteMany({ userId: "local-user" });

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

        await new User({
            userId: "local-user",
            login: "collector-local-user",
            email: "local-user@local.invalid",
            passwordHash: await bcrypt.hash("collector-local-user", 10),
            firstName: "Local",
            lastName: "Collector",
            displayName: "Local Collector",
            hideLocation: false,
            pinColor: "#0F766E",
            favorites: [],
            userNoiseWF: 1,
            userOccupancyWF: 1,
            role: "user",
            accountStatus: "active",
            emailVerifiedAt: new Date(),
            emailVerificationCode: null,
            emailVerificationExpiresAt: null,
            passwordResetCode: null,
            passwordResetCodeExpiresAt: null,
            passwordChangedAt: new Date(),
        }).save();

        console.log("Collector user added.");

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

seedData();
