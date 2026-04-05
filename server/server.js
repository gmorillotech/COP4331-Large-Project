const express = require("express");
const cors = require("cors");
require("dotenv").config();
const connectDB = require("./config/db");

// Import all route files
const authRoutes = require("./routes/authRoutes");
const locationRoutes = require("./routes/locationRoutes");
const { createReportRouter } = require("./routes/reportRoutes");
const StudyLocation = require("./models/StudyLocation");
const LocationGroup = require("./models/LocationGroup");
const studyLocationRoutes = require("./routes/studyLocationRoutes");
const { ReportProcessingService } = require("./services/reportProcessingService");
const {
  baseLocationAnnotations,
  baseLocationAnnotationsById,
  formatUpdatedAtLabel,
  toNoiseText,
  toOccupancyText,
  toSeverity,
} = require("./services/mapSearchData");
const { loadSearchSource } = require("./services/locationSearchSource");

const app = express();
const reportProcessingService = new ReportProcessingService();

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, DELETE, OPTIONS"
  );
  next();
});

function buildMapAnnotation(location, group) {
  const baseAnnotation = baseLocationAnnotationsById.get(location.studyLocationId);
  const liveNoise = Number.isFinite(location.currentNoiseLevel)
    ? location.currentNoiseLevel
    : (baseAnnotation?.noiseValue ?? null);
  const liveOccupancy = Number.isFinite(location.currentOccupancyLevel)
    ? location.currentOccupancyLevel
    : (baseAnnotation?.occupancyValue ?? null);

  return {
    id: location.studyLocationId,
    lat: location.latitude,
    lng: location.longitude,
    title: baseAnnotation?.title ?? location.name,
    buildingName: group?.name ?? baseAnnotation?.buildingName ?? location.name,
    floorLabel: baseAnnotation?.floorLabel,
    sublocationLabel: baseAnnotation?.sublocationLabel ?? location.name,
    summary:
      baseAnnotation?.summary ??
      `Live study-space reading for ${location.name}.`,
    statusText:
      Number.isFinite(location.currentNoiseLevel) &&
      Number.isFinite(location.currentOccupancyLevel)
        ? `Live estimate: ${location.currentNoiseLevel.toFixed(1)} dB, occupancy ${location.currentOccupancyLevel.toFixed(1)} / 5`
        : (baseAnnotation?.statusText ?? "Awaiting live reports"),
    noiseText: toNoiseText(liveNoise),
    noiseValue: liveNoise,
    occupancyText: toOccupancyText(liveOccupancy),
    occupancyValue: liveOccupancy,
    updatedAtLabel: location.updatedAt
      ? formatUpdatedAtLabel(location.updatedAt)
      : (baseAnnotation?.updatedAtLabel ?? "Awaiting live reports"),
    iconType: baseAnnotation?.iconType ?? "study",
    severity: Number.isFinite(liveNoise)
      ? toSeverity(liveNoise)
      : (baseAnnotation?.severity ?? "low"),
    color: baseAnnotation?.color ?? "#3A86FF",
    isFavorite: baseAnnotation?.isFavorite ?? false,
  };
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
app.use("/api/reports", createReportRouter({ reportProcessingService }));
app.use("/api", studyLocationRoutes);


const PORT = process.env.PORT || 5050;
const REPORT_POLL_INTERVAL_MS = Number(process.env.REPORT_POLL_INTERVAL_MS || 60_000);

// This function now correctly connects to the DB ONCE before starting the server.
const startServer = async () => {
  let databaseConnected = false;

  try {
    await connectDB(); // Connect to the database first
    databaseConnected = true;
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
    if (databaseConnected) {
      reportProcessingService.startPollingLoop(REPORT_POLL_INTERVAL_MS);
      console.log(`A1 polling loop started (${REPORT_POLL_INTERVAL_MS} ms interval)`);
    } else {
      console.warn("A1 polling loop disabled because MongoDB is unavailable.");
    }
  });
};

startServer();

app.get("/api/map-annotations", async (req, res) => {
  try {
    const sourceData = await loadSearchSource({
      StudyLocationModel: StudyLocation,
      LocationGroupModel: LocationGroup,
    });
    const groupsById = new Map(
      sourceData.groups.map((group) => [group.locationGroupId, group]),
    );
    const results = sourceData.locations.length > 0
      ? sourceData.locations.map((location) =>
          buildMapAnnotation(location, groupsById.get(location.locationGroupId)))
      : baseLocationAnnotations;

    res.status(200).json({
      results,
      error: "",
      source: sourceData.source,
    });
  } catch (_error) {
    res.status(200).json({
      results: baseLocationAnnotations,
      error: "",
      source: "catalog",
    });
  }
});
