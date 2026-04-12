require("dotenv").config();
const bcrypt = require("bcryptjs");

const connectDB = require("./config/db");
const User = require("./models/User");

const seedData = async () => {
  try {
    await connectDB();

    await User.deleteMany({ userId: "local-user" });

    console.log("Old data cleared.");

    await new User({
      userId: "local-user",
      login: "collector-local-user",
      email: "local-user@local.invalid",
      passwordHash: await bcrypt.hash("collector-local-user", 10),
      role: "user",
      accountStatus: "active",
      firstName: "Local",
      lastName: "Collector",
      displayName: "Local Collector",
      hideLocation: false,
      pinColor: "#0F766E",
      favorites: [],
      userNoiseWF: 1,
      userOccupancyWF: 1,
      emailVerificationCode: null,
      emailVerificationExpiresAt: null,
      emailVerifiedAt: new Date(),
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
