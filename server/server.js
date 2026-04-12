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
const adminRoutes = require("./routes/adminRoutes");
const adminSearchRoutes = require("./routes/adminSearchRoutes");
const adminLocationRoutes = require("./routes/adminLocationRoutes");
const adminUserRoutes = require("./routes/adminUserRoutes");
const { ReportProcessingService } = require("./services/reportProcessingService");
const {
  buildMapMarkerState,
  formatUpdatedAtLabel,
  toNoiseText,
  toOccupancyText,
  toSeverity,
} = require("./services/mapSearchData");
const {
  buildLocationStatusText,
  loadHistoricalBaselines,
} = require("./services/locationStatusText");
const { SERVER_RUNTIME_CONFIG } = require("./config/runtimeConfig");

const REPORT_STALE_MINUTES = SERVER_RUNTIME_CONFIG.display.reportStaleMinutes;
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
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  next();
});

function buildMapAnnotation(location, group, historicalBaseline = null) {
  const liveNoise = Number.isFinite(location.currentNoiseLevel)
    ? location.currentNoiseLevel
    : null;
  const liveOccupancy = Number.isFinite(location.currentOccupancyLevel)
    ? location.currentOccupancyLevel
    : null;

  const markerState = buildMapMarkerState(
    location.updatedAt,
    location.currentNoiseLevel,
    REPORT_STALE_MINUTES,
  );

  return {
    id: location.studyLocationId,
    lat: location.latitude,
    lng: location.longitude,
    title: location.name,
    buildingName: group?.name ?? location.name,
    floorLabel: location.floorLabel ?? "",
    sublocationLabel: location.sublocationLabel ?? location.name,
    summary: `Live study-space reading for ${location.name}.`,
    statusText: buildLocationStatusText({
      historicalBaseline,
      liveNoise,
      liveOccupancy,
    }),
    noiseText: toNoiseText(liveNoise),
    noiseValue: liveNoise,
    occupancyText: toOccupancyText(liveOccupancy),
    occupancyValue: liveOccupancy,
    updatedAtLabel: location.updatedAt
      ? formatUpdatedAtLabel(location.updatedAt)
      : "Awaiting live reports",
    iconType: "study",
    severity: Number.isFinite(liveNoise)
      ? toSeverity(liveNoise)
      : "low",
    color: "#3A86FF",
    isFavorite: false,
    // Marker animation state
    kind: "location",
    locationGroupId: location.locationGroupId ?? null,
    noiseBand: markerState.noiseBand,
    hasRecentData: markerState.hasRecentData,
    isAnimated: markerState.isAnimated,
    updatedAtIso: markerState.updatedAtIso,
  };
}

function polygonCentroid(vertices) {
  if (!vertices || vertices.length === 0) return null;
  const lat = vertices.reduce((sum, v) => sum + v.latitude, 0) / vertices.length;
  const lng = vertices.reduce((sum, v) => sum + v.longitude, 0) / vertices.length;
  return { lat, lng };
}

function buildGroupAnnotation(group, childLocations) {
  // Derive center from polygon centroid, then explicit fields, then child locations
  let lat = null;
  let lng = null;

  const centroid = polygonCentroid(group.polygon);
  if (centroid) {
    lat = centroid.lat;
    lng = centroid.lng;
  } else if (Number.isFinite(group.centerLatitude) && Number.isFinite(group.centerLongitude)) {
    lat = group.centerLatitude;
    lng = group.centerLongitude;
  } else if (childLocations.length > 0) {
    lat = childLocations.reduce((sum, l) => sum + l.latitude, 0) / childLocations.length;
    lng = childLocations.reduce((sum, l) => sum + l.longitude, 0) / childLocations.length;
  } else {
    return null; // no way to place this group on the map
  }

  const markerState = buildMapMarkerState(
    group.updatedAt,
    group.currentNoiseLevel,
    REPORT_STALE_MINUTES,
  );

  return {
    id: group.locationGroupId,
    lat,
    lng,
    title: group.name,
    buildingName: group.name,
    noiseText: toNoiseText(group.currentNoiseLevel),
    noiseValue: group.currentNoiseLevel ?? null,
    occupancyText: toOccupancyText(group.currentOccupancyLevel),
    severity: Number.isFinite(group.currentNoiseLevel)
      ? toSeverity(group.currentNoiseLevel)
      : "low",
    updatedAtLabel: group.updatedAt
      ? formatUpdatedAtLabel(group.updatedAt)
      : "Awaiting live reports",
    kind: "group",
    locationGroupId: group.locationGroupId,
    noiseBand: markerState.noiseBand,
    hasRecentData: markerState.hasRecentData,
    isAnimated: markerState.isAnimated,
    updatedAtIso: markerState.updatedAtIso,
    studyAreaCount: childLocations.length,
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
app.use("/api/admin", adminRoutes);
app.use("/api/admin", adminSearchRoutes);
app.use("/api/admin", adminLocationRoutes);
app.use("/api/admin/users", adminUserRoutes);


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
    const now = new Date();
    const sourceData = await loadSearchSource({
      StudyLocationModel: StudyLocation,
      LocationGroupModel: LocationGroup,
    });
    const groupsById = new Map(
      sourceData.groups.map((group) => [group.locationGroupId, group]),
    );
    const historicalBaselines = await loadHistoricalBaselines(
      sourceData.locations,
      reportProcessingService,
      now,
    );

    // Build location markers
    const locationResults = sourceData.locations.map((location) =>
      buildMapAnnotation(
        location,
        groupsById.get(location.locationGroupId),
        historicalBaselines.get(location.studyLocationId) ?? null,
      ));

    // Build group markers (derive center from polygon centroid)
    const locationsByGroup = new Map();
    for (const loc of sourceData.locations) {
      const gid = loc.locationGroupId;
      if (!locationsByGroup.has(gid)) locationsByGroup.set(gid, []);
      locationsByGroup.get(gid).push(loc);
    }

    const groupResults = sourceData.groups
      .map((group) => buildGroupAnnotation(group, locationsByGroup.get(group.locationGroupId) ?? []))
      .filter(Boolean);

    res.status(200).json({
      results: [...groupResults, ...locationResults],
      error: "",
      source: sourceData.source,
    });
  } catch (_error) {
    res.status(200).json({
      results: [],
      error: "Failed to load study spaces.",
      source: "error",
    });
  }
});
