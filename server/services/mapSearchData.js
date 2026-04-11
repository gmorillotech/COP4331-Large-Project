const baseLocationAnnotations = [
  {
    id: "library-floor-1-quiet",
    lat: 28.60024,
    lng: -81.20182,
    title: "Quiet Study",
    buildingName: "John C. Hitt Library",
    floorLabel: "Floor 1",
    sublocationLabel: "North Reading Room",
    summary: "Good for focused work with light foot traffic.",
    statusText: "Usually quiet at this time",
    noiseText: "Noise: Quiet",
    noiseValue: 43,
    occupancyText: "Occupancy: 2 users",
    occupancyValue: 2,
    updatedAtLabel: "Updated 2 minutes ago",
    iconType: "library",
    severity: "low",
    color: "#2a9d8f",
    isFavorite: true,
  },
  {
    id: "library-floor-2-moderate",
    lat: 28.60036,
    lng: -81.20168,
    title: "Collaboration Tables",
    buildingName: "John C. Hitt Library",
    floorLabel: "Floor 2",
    sublocationLabel: "West Commons",
    summary: "Conversation-friendly seating with moderate ambient sound.",
    statusText: "Moderate buzz near group tables",
    noiseText: "Noise: Moderate",
    noiseValue: 57,
    occupancyText: "Occupancy: 9 users",
    occupancyValue: 9,
    updatedAtLabel: "Updated 4 minutes ago",
    iconType: "library",
    severity: "medium",
    color: "#ff9f1c",
    isFavorite: false,
  },
  {
    id: "library-floor-3-busy",
    lat: 28.60048,
    lng: -81.20155,
    title: "Open Computer Lab",
    buildingName: "John C. Hitt Library",
    floorLabel: "Floor 3",
    sublocationLabel: "Digital Media Area",
    summary: "High circulation zone with steady keyboard and discussion noise.",
    statusText: "Busiest floor in the building",
    noiseText: "Noise: Busy",
    noiseValue: 73,
    occupancyText: "Occupancy: 18 users",
    occupancyValue: 18,
    updatedAtLabel: "Updated 1 minute ago",
    iconType: "library",
    severity: "high",
    color: "#d9485f",
    isFavorite: false,
  },
  {
    id: "library-floor-4-empty",
    lat: 28.60018,
    lng: -81.20198,
    title: "Silent Study Cubicles",
    buildingName: "John C. Hitt Library",
    floorLabel: "Floor 4",
    sublocationLabel: "East Quiet Wing",
    summary: "Sparse traffic and the calmest option in the library right now.",
    statusText: "Mostly empty",
    noiseText: "Noise: Very quiet",
    noiseValue: 39,
    occupancyText: "Occupancy: 1 user",
    occupancyValue: 1,
    updatedAtLabel: "Updated 6 minutes ago",
    iconType: "library",
    severity: "low",
    color: "#2a9d8f",
    isFavorite: true,
  },
  {
    id: "msb-floor-2-moderate",
    lat: 28.60116,
    lng: -81.19886,
    title: "Study Nook",
    buildingName: "Mathematical Sciences Building",
    floorLabel: "Floor 2",
    sublocationLabel: "Atrium Balcony",
    summary: "Reliable seating between classes with moderate hallway spillover.",
    statusText: "Moderate between class blocks",
    noiseText: "Noise: Moderate",
    noiseValue: 55,
    occupancyText: "Occupancy: 6 users",
    occupancyValue: 6,
    updatedAtLabel: "Updated 7 minutes ago",
    iconType: "study",
    severity: "medium",
    color: "#3a86ff",
    isFavorite: false,
  },
  {
    id: "student-union-food-court",
    lat: 28.60192,
    lng: -81.19994,
    title: "Food Court Seating",
    buildingName: "Student Union",
    floorLabel: "Level 1",
    sublocationLabel: "South Dining Hall",
    summary: "Convenient seating but consistently loud during lunch hours.",
    statusText: "Lunch rush is active",
    noiseText: "Noise: Loud",
    noiseValue: 76,
    occupancyText: "Occupancy: 21 users",
    occupancyValue: 21,
    updatedAtLabel: "Updated just now",
    iconType: "community",
    severity: "high",
    color: "#d9485f",
    isFavorite: false,
  },
];

const baseLocationAnnotationsById = new Map(
  baseLocationAnnotations.map((annotation) => [annotation.id, annotation]),
);

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceInMeters(aLat, aLng, bLat, bLng) {
  const earthRadiusMeters = 6371000;
  const deltaLat = toRadians(bLat - aLat);
  const deltaLng = toRadians(bLng - aLng);
  const startLat = toRadians(aLat);
  const endLat = toRadians(bLat);

  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

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

function parseOccupancyFallback(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return value;
}

/**
 * Returns true when the given updatedAt timestamp is within the stale window.
 * Uses the same REPORT_STALE_MINUTES constant as the rest of the system.
 */
function isRecentReading(updatedAt, staleMinutes) {
  if (!updatedAt) return false;
  const cutoff = Date.now() - staleMinutes * 60 * 1000;
  return new Date(updatedAt).getTime() >= cutoff;
}

/**
 * Maps a numeric currentNoiseLevel to a qualitative band 1..5.
 * Returns null when the noise level is not a finite number.
 *
 * Band 1: very quiet  (< 40 dB)
 * Band 2: quiet       (40–51 dB)
 * Band 3: moderate    (52–61 dB)
 * Band 4: busy        (62–67 dB)
 * Band 5: loud        (>= 68 dB)
 */
function toNoiseBand(noiseLevel) {
  if (!Number.isFinite(noiseLevel)) return null;
  if (noiseLevel < 40) return 1;
  if (noiseLevel < 52) return 2;
  if (noiseLevel < 62) return 3;
  if (noiseLevel < 68) return 4;
  return 5;
}

/**
 * Builds the marker-state fields that the frontend needs for animated vs
 * static marker rendering.
 */
function buildMapMarkerState(updatedAt, currentNoiseLevel, staleMinutes) {
  const recent = isRecentReading(updatedAt, staleMinutes);
  return {
    noiseBand: toNoiseBand(currentNoiseLevel),
    hasRecentData: recent,
    isAnimated: recent && Number.isFinite(currentNoiseLevel),
    updatedAtIso: updatedAt ? new Date(updatedAt).toISOString() : null,
  };
}

module.exports = {
  baseLocationAnnotations,
  baseLocationAnnotationsById,
  buildMapMarkerState,
  distanceInMeters,
  formatUpdatedAtLabel,
  isRecentReading,
  parseOccupancyFallback,
  toNoiseBand,
  toNoiseText,
  toOccupancyText,
  toSeverity,
};
