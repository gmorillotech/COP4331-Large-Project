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
