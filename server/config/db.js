// FINAL CORRECTED VERSION for config/db.js
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    let uri = process.env.MONGO_URI;

    // In test mode, spin up an in-process MongoDB so no external server is needed.
    if (process.env.NODE_ENV === "test") {
      const { MongoMemoryServer } = require("mongodb-memory-server");
      const mongod = await MongoMemoryServer.create();
      uri = mongod.getUri();
      // Attach to process so testRoutes can reference it for teardown if needed.
      process._mongoMemoryServer = mongod;
    }

    const conn = await mongoose.connect(uri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`Error connecting to MongoDB: ${err.message}`);
    throw err;
  }
};

module.exports = connectDB;
