// FINAL CORRECTED VERSION for config/db.js
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    // This is now a simple utility function. It no longer has req, res, or next.
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`Error connecting to MongoDB: ${err.message}`);
    throw err;
  }
};

module.exports = connectDB;
