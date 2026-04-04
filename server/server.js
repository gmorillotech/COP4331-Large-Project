const express = require("express");
const cors = require("cors");
require("dotenv").config();
const connectDB = require("./config/db");

// Import all route files
const authRoutes = require("./routes/authRoutes");
const locationRoutes = require("./routes/locationRoutes");
const reportRoutes = require("./routes/reportRoutes");
const StudyLocation = require("./models/StudyLocation");
const LocationGroup = require("./models/LocationGroup");
const studyLocationRoutes = require("./routes/studyLocationRoutes");

const app = express();

app.use(cors());
app.use(express.json());




function toSeverity(noiseLevel) {
  if (!Number.isFinite(noiseLevel)) {
    return "low";
  }

  if (noiseLevel >= 68) {
    return "high";
  }

  if (noiseLevel >= 52) {
    return "medium";
  }

  return "low";
}

function toNoiseText(noiseLevel) {
  if (!Number.isFinite(noiseLevel)) {
    return "Noise unavailable";
  }

  if (noiseLevel >= 68) {
    return `Noise: Loud (${noiseLevel.toFixed(1)} dB)`;
  }

  if (noiseLevel >= 52) {
    return `Noise: Moderate (${noiseLevel.toFixed(1)} dB)`;
  }

  return `Noise: Quiet (${noiseLevel.toFixed(1)} dB)`;
}

function toOccupancyText(occupancyLevel) {
  if (!Number.isFinite(occupancyLevel)) {
    return "Occupancy unavailable";
  }

  return `Occupancy: ${occupancyLevel.toFixed(1)} / 5`;
}

function formatUpdatedAtLabel(updatedAt) {
  if (!updatedAt) {
    return "Awaiting live reports";
  }

  const elapsedMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(updatedAt).getTime()) / 60000),
  );

  if (elapsedMinutes <= 0) {
    return "Updated just now";
  }

  if (elapsedMinutes === 1) {
    return "Updated 1 minute ago";
  }

  return `Updated ${elapsedMinutes} minutes ago`;
}


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
app.use("/api", studyLocationRoutes);


const PORT = process.env.PORT || 5050;

// This function now correctly connects to the DB ONCE before starting the server.
const startServer = async () => {
  try {
    await connectDB(); // Connect to the database first
  } catch (err) {
    const isProduction = process.env.NODE_ENV === "production";
    if (isProduction) {
      console.error("Failed to start server:", err.message);
      process.exit(1);
    }

    console.warn(
      "MongoDB unavailable. Starting in degraded local mode so fallback routes can still be tested."
    );
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();

app.get("/api/map-annotations", async (req, res) => {
  try {
    const [locations, groups] = await Promise.all([
      StudyLocation.find().lean(),
      LocationGroup.find().lean(),
    ]);

    const groupsById = new Map(groups.map((g) => [g.locationGroupId, g]));

    const results = locations.map((location) => {
      const group = groupsById.get(location.locationGroupId);
      const noise = location.currentNoiseLevel;
      const occupancy = location.currentOccupancyLevel;
      const hasNoise = Number.isFinite(noise);
      const hasOccupancy = Number.isFinite(occupancy);

      return {
        id: location.studyLocationId,
        lat: location.latitude,
        lng: location.longitude,
        title: group?.name ?? location.name,
        buildingName: group?.name,
        sublocationLabel: location.name,
        severity: toSeverity(noise),
        noiseText: toNoiseText(noise),
        occupancyText: toOccupancyText(occupancy),
        statusText:
          hasNoise && hasOccupancy
            ? `Live: ${noise.toFixed(1)} dB, occupancy ${occupancy.toFixed(1)} / 5`
            : undefined,
        updatedAtLabel: formatUpdatedAtLabel(location.updatedAt),
      };
    });

    res.status(200).json({ results, error: "" });
  } catch (err) {
    console.error("map-annotations error:", err.message);
    res.status(500).json({ results: [], error: "Failed to load locations" });
  }
});
