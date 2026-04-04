const express = require("express");

const LocationGroup = require("../models/LocationGroup");
const StudyLocation = require("../models/StudyLocation");
const { LocationController } = require("../controllers/locationController");
const { LocationGroupRepository } = require("../repositories/LocationGroupRepository");
const { StudyLocationRepository } = require("../repositories/StudyLocationRepository");
const { LocationService } = require("../services/locationService");
const {
  baseLocationAnnotationsById,
  distanceInMeters,
  formatUpdatedAtLabel,
  toNoiseText,
  toOccupancyText,
  toSeverity,
} = require("../services/mapSearchData");
const { loadSearchSource } = require("../services/locationSearchSource");

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function parseBoolean(value, defaultValue) {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatGroupOccupancyText(value, count) {
  if (isFiniteNumber(value)) {
    return `Occupancy: ${value.toFixed(1)} / 5`;
  }

  return `${count} reported study area${count === 1 ? "" : "s"}`;
}

function buildLocationSearchText(location, groupName, base) {
  return [
    location.name,
    groupName,
    base?.floorLabel,
    base?.sublocationLabel,
    base?.summary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildSummary(base, occupancyValue, noiseValue) {
  if (base?.summary) {
    return base.summary;
  }

  if (isFiniteNumber(noiseValue) && isFiniteNumber(occupancyValue)) {
    return `Live estimate: ${noiseValue.toFixed(1)} dB with occupancy ${occupancyValue.toFixed(1)} / 5.`;
  }

  return "Study area data available from recent reports.";
}

function buildLocationNode(location, group, anchor) {
  const base = baseLocationAnnotationsById.get(location.studyLocationId);
  const lat = location.latitude ?? base?.lat ?? 0;
  const lng = location.longitude ?? base?.lng ?? 0;
  const noiseValue = isFiniteNumber(location.currentNoiseLevel)
    ? location.currentNoiseLevel
    : (base?.noiseValue ?? null);
  const occupancyValue = isFiniteNumber(location.currentOccupancyLevel)
    ? location.currentOccupancyLevel
    : (base?.occupancyValue ?? null);
  const buildingName = group?.name ?? base?.buildingName ?? "Unknown Building";
  const distanceMeters = anchor
    ? distanceInMeters(anchor.lat, anchor.lng, lat, lng)
    : null;

  return {
    id: location.studyLocationId,
    kind: "location",
    title: location.name ?? base?.title ?? "Study Location",
    buildingName,
    floorLabel: base?.floorLabel ?? "",
    sublocationLabel: base?.sublocationLabel ?? "",
    summary: buildSummary(base, occupancyValue, noiseValue),
    statusText:
      isFiniteNumber(location.currentNoiseLevel) && isFiniteNumber(location.currentOccupancyLevel)
        ? `Live estimate: ${location.currentNoiseLevel.toFixed(1)} dB, occupancy ${location.currentOccupancyLevel.toFixed(1)} / 5`
        : (base?.statusText ?? "Status unavailable"),
    noiseText: isFiniteNumber(location.currentNoiseLevel)
      ? toNoiseText(location.currentNoiseLevel)
      : (base?.noiseText ?? "Noise unavailable"),
    occupancyText: isFiniteNumber(location.currentOccupancyLevel)
      ? toOccupancyText(location.currentOccupancyLevel)
      : (base?.occupancyText ?? "Occupancy unavailable"),
    updatedAtLabel: location.updatedAt
      ? formatUpdatedAtLabel(location.updatedAt)
      : (base?.updatedAtLabel ?? "Awaiting live reports"),
    lat,
    lng,
    color: base?.color ?? "#3a86ff",
    severity: isFiniteNumber(noiseValue) ? toSeverity(noiseValue) : (base?.severity ?? "low"),
    badge: (base?.floorLabel?.match(/(\d+)/)?.[1] ?? (location.name ?? "S")[0] ?? "S").toUpperCase(),
    locationCount: 1,
    isFavorite: Boolean(base?.isFavorite),
    noiseValue,
    occupancyValue,
    distanceMeters,
    searchText: buildLocationSearchText(location, buildingName, base),
  };
}

function buildGroupNode(group, locations, anchor) {
  const lat = locations.reduce((sum, location) => sum + location.lat, 0) / Math.max(locations.length, 1);
  const lng = locations.reduce((sum, location) => sum + location.lng, 0) / Math.max(locations.length, 1);
  const quietCount = locations.filter((location) => location.severity === "low").length;
  const liveNoiseValues = locations.map((location) => location.noiseValue).filter((value) => isFiniteNumber(value));
  const liveOccupancyValues = locations.map((location) => location.occupancyValue).filter((value) => isFiniteNumber(value));
  const groupNoise = isFiniteNumber(group.currentNoiseLevel)
    ? group.currentNoiseLevel
    : (liveNoiseValues.length > 0
      ? liveNoiseValues.reduce((sum, value) => sum + value, 0) / liveNoiseValues.length
      : null);
  const groupOccupancy = isFiniteNumber(group.currentOccupancyLevel)
    ? group.currentOccupancyLevel
    : (liveOccupancyValues.length > 0
      ? liveOccupancyValues.reduce((sum, value) => sum + value, 0) / liveOccupancyValues.length
      : null);
  const severitySource = isFiniteNumber(groupNoise)
    ? toSeverity(groupNoise)
    : locations
        .map((location) => location.severity)
        .sort((left, right) => ["low", "medium", "high"].indexOf(right) - ["low", "medium", "high"].indexOf(left))[0] ?? "low";
  const distanceMeters = anchor ? distanceInMeters(anchor.lat, anchor.lng, lat, lng) : null;
  const searchText = [
    group.name,
    ...locations.flatMap((location) => [location.title, location.floorLabel, location.sublocationLabel]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return {
    id: group.locationGroupId,
    kind: "group",
    title: group.name,
    buildingName: group.name,
    floorLabel: "",
    sublocationLabel: "",
    summary: `${locations.length} study area${locations.length === 1 ? "" : "s"}, ${quietCount} quiet option${quietCount === 1 ? "" : "s"}.`,
    statusText: "Building overview",
    noiseText: isFiniteNumber(groupNoise) ? toNoiseText(groupNoise) : "Noise unavailable",
    occupancyText: formatGroupOccupancyText(groupOccupancy, locations.length),
    updatedAtLabel: group.updatedAt
      ? formatUpdatedAtLabel(group.updatedAt)
      : (locations[0]?.updatedAtLabel ?? "Awaiting live reports"),
    lat,
    lng,
    color: locations[0]?.color ?? "#3a86ff",
    severity: severitySource,
    badge: (group.name?.[0] ?? "B").toUpperCase(),
    locationCount: locations.length,
    isFavorite: locations.some((location) => location.isFavorite),
    noiseValue: groupNoise,
    occupancyValue: groupOccupancy,
    distanceMeters,
    searchText,
  };
}

function relevanceScore(node, query) {
  if (!query) {
    return 0;
  }

  const text = node.searchText;
  if (text === query) {
    return 300;
  }

  if (text.startsWith(query)) {
    return 220;
  }

  if (text.includes(` ${query}`)) {
    return 160;
  }

  if (text.includes(query)) {
    return 100;
  }

  return 0;
}

function compareNullable(left, right, fallback) {
  const leftFinite = isFiniteNumber(left);
  const rightFinite = isFiniteNumber(right);

  if (leftFinite && rightFinite) {
    if (left !== right) {
      return left - right;
    }

    return fallback;
  }

  if (leftFinite) {
    return -1;
  }

  if (rightFinite) {
    return 1;
  }

  return fallback;
}

function sortNodes(nodes, query, sortOrder) {
  return [...nodes].sort((left, right) => {
    const titleFallback = `${left.buildingName} ${left.title}`.localeCompare(`${right.buildingName} ${right.title}`);

    for (const sortBy of sortOrder) {
      if (sortBy === "distance") {
        const delta = compareNullable(left.distanceMeters, right.distanceMeters, titleFallback);
        if (delta !== 0) {
          return delta;
        }
        continue;
      }

      if (sortBy === "noise") {
        const delta = compareNullable(left.noiseValue, right.noiseValue, titleFallback);
        if (delta !== 0) {
          return delta;
        }
        continue;
      }

      if (sortBy === "occupancy") {
        const delta = compareNullable(left.occupancyValue, right.occupancyValue, titleFallback);
        if (delta !== 0) {
          return delta;
        }
        continue;
      }

      const scoreDelta = relevanceScore(right, query) - relevanceScore(left, query);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
    }

    return titleFallback;
  });
}

function createLocationRouter({
  StudyLocationModel = StudyLocation,
  LocationGroupModel = LocationGroup,
} = {}) {
  const router = express.Router();
  const studyLocationRepository = new StudyLocationRepository(StudyLocationModel);
  const locationGroupRepository = new LocationGroupRepository(LocationGroupModel);
  const locationService = new LocationService(
    studyLocationRepository,
    locationGroupRepository,
    Number.POSITIVE_INFINITY,
  );
  const locationController = new LocationController(locationService);

  router.get("/groups", locationController.getAllGroups.bind(locationController));

  router.get("/groups/:groupId/locations", locationController.getLocationByGroup.bind(locationController));

  router.get("/search", async (req, res) => {
    const query = String(req.query.q ?? "").trim().toLowerCase();
    const sortOrder = String(req.query.sortBy ?? "relevance")
      .split(",")
      .map((value) => value.trim())
      .filter((value, index, values) =>
        ["relevance", "distance", "noise", "occupancy"].includes(value) && values.indexOf(value) === index,
      );
    const includeGroups = parseBoolean(req.query.includeGroups, true);
    const includeLocations = parseBoolean(req.query.includeLocations, true);
    const anchorLat = parseOptionalNumber(req.query.lat);
    const anchorLng = parseOptionalNumber(req.query.lng);
    const maxRadiusMeters = parseOptionalNumber(req.query.maxRadiusMeters);
    const minNoise = parseOptionalNumber(req.query.minNoise);
    const maxNoise = parseOptionalNumber(req.query.maxNoise);
    const maxOccupancy = parseOptionalNumber(req.query.maxOccupancy);
    const anchor = isFiniteNumber(anchorLat) && isFiniteNumber(anchorLng)
      ? { lat: anchorLat, lng: anchorLng }
      : null;

    try {
      const sourceData = await loadSearchSource({ StudyLocationModel, LocationGroupModel });
      const groupsById = new Map(sourceData.groups.map((group) => [group.locationGroupId, group]));
      const rawLocationNodes = sourceData.locations.map((location) =>
        buildLocationNode(location, groupsById.get(location.locationGroupId) ?? null, anchor),
      );
      const locationNodesByGroupId = new Map();

      for (const location of sourceData.locations) {
        const node = rawLocationNodes.find((entry) => entry.id === location.studyLocationId);
        if (!node) {
          continue;
        }
        if (!locationNodesByGroupId.has(location.locationGroupId)) {
          locationNodesByGroupId.set(location.locationGroupId, []);
        }
        locationNodesByGroupId.get(location.locationGroupId).push(node);
      }

      const groupNodes = sourceData.groups
        .map((group) => buildGroupNode(group, locationNodesByGroupId.get(group.locationGroupId) ?? [], anchor))
        .filter((group) => group.locationCount > 0);

      let nodes = [];
      if (includeLocations) {
        nodes.push(...rawLocationNodes);
      }
      if (includeGroups) {
        nodes.push(...groupNodes);
      }

      if (query) {
        nodes = nodes.filter((node) => node.searchText.includes(query));
      }

      if (isFiniteNumber(minNoise)) {
        nodes = nodes.filter((node) => isFiniteNumber(node.noiseValue) && node.noiseValue >= minNoise);
      }

      if (isFiniteNumber(maxNoise)) {
        nodes = nodes.filter((node) => isFiniteNumber(node.noiseValue) && node.noiseValue <= maxNoise);
      }

      if (isFiniteNumber(maxOccupancy)) {
        nodes = nodes.filter((node) => isFiniteNumber(node.occupancyValue) && node.occupancyValue <= maxOccupancy);
      }

      if (anchor && isFiniteNumber(maxRadiusMeters)) {
        nodes = nodes.filter((node) => isFiniteNumber(node.distanceMeters) && node.distanceMeters <= maxRadiusMeters);
      }

      const results = sortNodes(
        nodes,
        query,
        sortOrder.length > 0 ? sortOrder : ["relevance"],
      ).map(({ searchText, ...node }) => node);

      return res.status(200).json({
        results,
        error: "",
        source: sourceData.source,
      });
    } catch (_error) {
      return res.status(500).json({ error: "Server error searching locations." });
    }
  });

  router.get("/closest", locationController.getClosestLocation.bind(locationController));

  router.get("/:locationId", locationController.getLocationById.bind(locationController));

  return router;
}

module.exports = createLocationRouter();
module.exports.createLocationRouter = createLocationRouter;
