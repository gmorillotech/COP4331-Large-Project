const express = require("express");
const cors = require("cors");
require("dotenv").config();
const connectDB = require("./config/db");

// Import all route files
const authRoutes = require("./routes/authRoutes");
const locationRoutes = require("./routes/locationRoutes");
const reportRoutes = require("./routes/reportRoutes");
const cardRoutes = require("./routes/cardRoutes");

const Users = require("./models/User");
const LocationGroup = require("./models/LocationGroup");
const StudyLocation = require("./models/StudyLocation");
const Report = require("./models/Report");

const app = express();

app.use(cors());
app.use(express.json());

// Simple request logger
app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "UP", timestamp: new Date() });
});

// Wire up API routes
app.use("/api/auth", authRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/cards", cardRoutes);

const PORT = process.env.PORT || 5050;

// This function now correctly connects to the DB ONCE before starting the server.
const startServer = async () => {
  try {
    await connectDB(); // Connect to the database first
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  }
};

startServer();