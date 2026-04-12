const LocationGroup = require("../models/LocationGroup");
const StudyLocation = require("../models/StudyLocation");
const {
  distanceInMeters,
  formatUpdatedAtLabel,
  toNoiseText,
  toOccupancyText,
  toSeverity,
} = require("./mapSearchData");
const {
  buildLocationStatusText,
  isLiveDataFresh,
  loadHistoricalBaselines,
} = require("./locationStatusText");
const { loadSearchSource } = require("./locationSearchSource");
const { SERVER_RUNTIME_CONFIG } = require("../config/runtimeConfig");

const STATUS_FALLBACK_FRESHNESS_MINUTES =
  SERVER_RUNTIME_CONFIG.display.statusFallbackFreshnessMinutes;

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

function buildLocationSearchText(location, groupName) {
  return [
    location.name,
    groupName,
    location.floorLabel,
    location.sublocationLabel,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildSummary(occupancyValue, noiseValue) {
  if (isFiniteNumber(noiseValue) && isFiniteNumber(occupancyValue)) {
    return `Live estimate: ${noiseValue.toFixed(1)} dB with occupancy ${occupancyValue.toFixed(1)} / 5.`;
  }

  return "Study area data available from recent reports.";
}

function buildLocationNode(location, group, anchor, historicalBaseline = null, now = new Date()) {
  const lat = location.latitude ?? 0;
  const lng = location.longitude ?? 0;
  const noiseValue = isFiniteNumber(location.currentNoiseLevel)
    ? location.currentNoiseLevel
    : null;
  const occupancyValue = isFiniteNumber(location.currentOccupancyLevel)
    ? location.currentOccupancyLevel
    : null;
  const buildingName = group?.name ?? "Unknown Building";
  const distanceMeters = anchor
    ? distanceInMeters(anchor.lat, anchor.lng, lat, lng)
    : null;

  return {
    id: location.studyLocationId,
    kind: "location",
    title: location.name ?? "Study Location",
    buildingName,
    floorLabel: location.floorLabel ?? "",
    sublocationLabel: location.sublocationLabel ?? "",
    summary: buildSummary(occupancyValue, noiseValue),
    statusText: buildLocationStatusText({
      historicalBaseline,
      liveNoise: noiseValue,
      liveOccupancy: occupancyValue,
      liveUpdatedAt: location.updatedAt ?? null,
      freshnessMinutes: STATUS_FALLBACK_FRESHNESS_MINUTES,
      now,
    }),
    noiseText: toNoiseText(location.currentNoiseLevel),
    occupancyText: toOccupancyText(location.currentOccupancyLevel),
    updatedAtLabel: location.updatedAt
      ? formatUpdatedAtLabel(location.updatedAt)
      : "Awaiting live reports",
    lat,
    lng,
    color: "#3a86ff",
    severity: isFiniteNumber(noiseValue) ? toSeverity(noiseValue) : "low",
    badge: (location.floorLabel?.match(/(\d+)/)?.[1] ?? (location.name ?? "S")[0] ?? "S").toUpperCase(),
    locationCount: 1,
    isFavorite: false,
    noiseValue,
    occupancyValue,
    distanceMeters,
    searchText: buildLocationSearchText(location, buildingName),
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

function normalizeSearchParams(query = {}) {
  const searchQuery = String(query.q ?? "").trim().toLowerCase();
  const sortOrder = String(query.sortBy ?? "relevance")
    .split(",")
    .map((value) => value.trim())
    .filter((value, index, values) =>
      ["relevance", "distance", "noise", "occupancy"].includes(value) && values.indexOf(value) === index,
    );
  const includeGroups = parseBoolean(query.includeGroups, true);
  const includeLocations = parseBoolean(query.includeLocations, true);
  const anchorLat = parseOptionalNumber(query.lat);
  const anchorLng = parseOptionalNumber(query.lng);
  const maxRadiusMeters = parseOptionalNumber(query.maxRadiusMeters);
  const minNoise = parseOptionalNumber(query.minNoise);
  const maxNoise = parseOptionalNumber(query.maxNoise);
  const maxOccupancy = parseOptionalNumber(query.maxOccupancy);
  const anchor = isFiniteNumber(anchorLat) && isFiniteNumber(anchorLng)
    ? { lat: anchorLat, lng: anchorLng }
    : null;

  const minLat = parseOptionalNumber(query.minLat);
  const minLng = parseOptionalNumber(query.minLng);
  const maxLat = parseOptionalNumber(query.maxLat);
  const maxLng = parseOptionalNumber(query.maxLng);
  const bounds =
    isFiniteNumber(minLat) &&
    isFiniteNumber(minLng) &&
    isFiniteNumber(maxLat) &&
    isFiniteNumber(maxLng)
      ? { minLat, minLng, maxLat, maxLng }
      : null;

  return {
    query: searchQuery,
    sortOrder: sortOrder.length > 0 ? sortOrder : ["relevance"],
    includeGroups,
    includeLocations,
    anchor,
    bounds,
    maxRadiusMeters,
    minNoise,
    maxNoise,
    maxOccupancy,
  };
}

function isLocationInBounds(location, bounds) {
  if (!bounds) {
    return true;
  }
  const lat = location.latitude;
  const lng = location.longitude;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
    return false;
  }
  return (
    lat >= bounds.minLat &&
    lat <= bounds.maxLat &&
    lng >= bounds.minLng &&
    lng <= bounds.maxLng
  );
}

async function searchLocations(rawQuery = {}, {
  StudyLocationModel = StudyLocation,
  LocationGroupModel = LocationGroup,
  reportProcessingService = null,
  now = new Date(),
} = {}) {
  const params = normalizeSearchParams(rawQuery);
  const sourceData = await loadSearchSource({ StudyLocationModel, LocationGroupModel });
  const groupsById = new Map(sourceData.groups.map((group) => [group.locationGroupId, group]));

  // Apply viewport bounds before building nodes so we don't pay to build
  // location nodes for rows outside the current viewport.
  const candidateLocations = params.bounds
    ? sourceData.locations.filter((location) => isLocationInBounds(location, params.bounds))
    : sourceData.locations;

  // Build location nodes first without historical baselines. Baselines are
  // hydrated later for just the locations that actually survive filtering
  // and whose live data isn't already fresh.
  const rawLocationNodes = candidateLocations.map((location) =>
    buildLocationNode(
      location,
      groupsById.get(location.locationGroupId) ?? null,
      params.anchor,
      null,
      now,
    ),
  );
  const locationNodesByGroupId = new Map();

  for (const location of candidateLocations) {
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
    .map((group) => buildGroupNode(group, locationNodesByGroupId.get(group.locationGroupId) ?? [], params.anchor))
    .filter((group) => group.locationCount > 0);

  let nodes = [];
  if (params.includeLocations) {
    nodes.push(...rawLocationNodes);
  }
  if (params.includeGroups) {
    nodes.push(...groupNodes);
  }

  if (params.query) {
    nodes = nodes.filter((node) => node.searchText.includes(params.query));
  }

  if (isFiniteNumber(params.minNoise)) {
    nodes = nodes.filter((node) => isFiniteNumber(node.noiseValue) && node.noiseValue >= params.minNoise);
  }

  if (isFiniteNumber(params.maxNoise)) {
    nodes = nodes.filter((node) => isFiniteNumber(node.noiseValue) && node.noiseValue <= params.maxNoise);
  }

  if (isFiniteNumber(params.maxOccupancy)) {
    nodes = nodes.filter((node) => isFiniteNumber(node.occupancyValue) && node.occupancyValue <= params.maxOccupancy);
  }

  if (params.anchor && isFiniteNumber(params.maxRadiusMeters)) {
    nodes = nodes.filter((node) => isFiniteNumber(node.distanceMeters) && node.distanceMeters <= params.maxRadiusMeters);
  }

  const sorted = sortNodes(nodes, params.query, params.sortOrder);

  // Hydrate historical baselines only for returned location-kind nodes whose
  // live data is not already fresh. This keeps baseline fetches scoped to the
  // viewport/result set and avoids catalog-wide hydration.
  const locationsById = new Map(
    candidateLocations.map((location) => [location.studyLocationId, location]),
  );
  const locationsNeedingBaseline = [];
  for (const node of sorted) {
    if (node.kind !== "location") {
      continue;
    }
    const live = locationsById.get(node.id);
    if (!live) {
      continue;
    }
    const hasFiniteLive =
      isFiniteNumber(live.currentNoiseLevel) &&
      isFiniteNumber(live.currentOccupancyLevel);
    if (
      hasFiniteLive &&
      isLiveDataFresh(live.updatedAt, now, STATUS_FALLBACK_FRESHNESS_MINUTES)
    ) {
      continue;
    }
    locationsNeedingBaseline.push(live);
  }

  const historicalBaselines = await loadHistoricalBaselines(
    locationsNeedingBaseline,
    reportProcessingService,
    now,
  );

  if (historicalBaselines.size > 0) {
    for (const node of sorted) {
      if (node.kind !== "location") {
        continue;
      }
      const baseline = historicalBaselines.get(node.id);
      if (!baseline) {
        continue;
      }
      node.statusText = buildLocationStatusText({
        historicalBaseline: baseline,
        liveNoise: node.noiseValue,
        liveOccupancy: node.occupancyValue,
        liveUpdatedAt: locationsById.get(node.id)?.updatedAt ?? null,
        freshnessMinutes: STATUS_FALLBACK_FRESHNESS_MINUTES,
        now,
      });
    }
  }

  return {
    results: sorted.map(({ searchText, ...node }) => node),
    error: "",
    source: sourceData.source,
  };
}

module.exports = {
  searchLocations,
};
