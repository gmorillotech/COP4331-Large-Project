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
} = require("./services/locationStatusText");
const { SERVER_RUNTIME_CONFIG } = require("./config/runtimeConfig");
const { loadSearchSource } = require("./services/locationSearchSource");
const { defaultA1Config } = require("../shared/src/uml_service_layout");

const REPORT_STALE_MINUTES = SERVER_RUNTIME_CONFIG.display.reportStaleMinutes;
// Unified freshness window — same value A1 uses for groupFreshnessWindowMs
// and locationSearchService uses for live-data fallback text.
const STATUS_FALLBACK_FRESHNESS_MINUTES =
  SERVER_RUNTIME_CONFIG.freshness.freshnessMinutes;

// Startup diagnostic: echoes the A1 retention config the running process
// actually captured from defaultA1Config. If the numbers don't match the
// values in shared/src/uml_service_layout.js, the process is running a
// stale module (likely a still-running old node process, a cached require,
// or a dist build frozen at an earlier version).
//   halfLifeMs        = 172800000  → 48 h  (2 day half-life)
//   archiveThresholdMs= 172800000  → 48 h  (source rows deleted after this)
//   minWeightThreshold= 0.05
// Any other values mean the config on disk isn't what's loaded.
console.log(
  "[startup] A1 retention: " +
    `halfLifeMs=${defaultA1Config.reportHalfLifeMs}, ` +
    `archiveThresholdMs=${defaultA1Config.archiveThresholdMs}, ` +
    `minWeightThreshold=${defaultA1Config.minWeightThreshold}`,
);

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

function buildMapAnnotation(location, group, historicalBaseline = null, now = new Date()) {
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
    description: location.description ?? "",
    summary: location.description?.trim()
      ? location.description.trim()
      : `Live study-space reading for ${location.name}.`,
    statusText: buildLocationStatusText({
      historicalBaseline,
      liveNoise,
      liveOccupancy,
      liveUpdatedAt: location.updatedAt ?? null,
      freshnessMinutes: STATUS_FALLBACK_FRESHNESS_MINUTES,
      now,
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

  // Prefer the group's own rolled-up values (written by A1 polling). When
  // those aren't yet populated — brand-new group, A1 hasn't cycled, or all
  // children's currentNoiseLevel went null from decay — fall back to the
  // mean of child sublocations. Mirrors the fallback in
  // locationSearchService.buildGroupNode so the map and search endpoints
  // expose the same group-level aggregates.
  const childNoiseValues = childLocations
    .map((l) => l.currentNoiseLevel)
    .filter((v) => Number.isFinite(v));
  const childOccupancyValues = childLocations
    .map((l) => l.currentOccupancyLevel)
    .filter((v) => Number.isFinite(v));
  const groupNoise = Number.isFinite(group.currentNoiseLevel)
    ? group.currentNoiseLevel
    : (childNoiseValues.length > 0
      ? childNoiseValues.reduce((sum, v) => sum + v, 0) / childNoiseValues.length
      : null);
  const groupOccupancy = Number.isFinite(group.currentOccupancyLevel)
    ? group.currentOccupancyLevel
    : (childOccupancyValues.length > 0
      ? childOccupancyValues.reduce((sum, v) => sum + v, 0) / childOccupancyValues.length
      : null);

  // Use the group's own updatedAt, or fall back to the most recent child
  // sublocation timestamp so the freshness window aligns with the
  // synthesized aggregate. Otherwise a fresh child reading would label the
  // group "Awaiting live reports" even though we just derived a real
  // noise value from it.
  const childUpdatedMs = childLocations
    .map((l) => (l.updatedAt ? new Date(l.updatedAt).getTime() : NaN))
    .filter((t) => Number.isFinite(t));
  const effectiveUpdatedAt = group.updatedAt
    ? new Date(group.updatedAt)
    : (childUpdatedMs.length > 0 ? new Date(Math.max(...childUpdatedMs)) : null);

  const markerState = buildMapMarkerState(
    effectiveUpdatedAt,
    groupNoise,
    REPORT_STALE_MINUTES,
  );

  return {
    id: group.locationGroupId,
    lat,
    lng,
    title: group.name,
    buildingName: group.name,
    noiseText: toNoiseText(groupNoise),
    noiseValue: groupNoise,
    occupancyText: toOccupancyText(groupOccupancy),
    occupancyValue: groupOccupancy,
    severity: Number.isFinite(groupNoise)
      ? toSeverity(groupNoise)
      : "low",
    updatedAtLabel: effectiveUpdatedAt
      ? formatUpdatedAtLabel(effectiveUpdatedAt)
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

    // Annotations stay minimal: no catalog-wide baseline hydration here.
    // Live status text (or "Awaiting live reports") is sufficient for markers;
    // the richer historical fallback is scoped to search/result flows.
    const locationResults = sourceData.locations.map((location) =>
      buildMapAnnotation(
        location,
        groupsById.get(location.locationGroupId),
        null,
        now,
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
