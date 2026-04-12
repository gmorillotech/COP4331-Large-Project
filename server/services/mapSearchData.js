const { SERVER_RUNTIME_CONFIG } = require("../config/runtimeConfig");

const NOISE_THRESHOLDS = SERVER_RUNTIME_CONFIG.display.noiseThresholds;

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

  if (noiseLevel >= NOISE_THRESHOLDS.busy) {
    return "high";
  }

  if (noiseLevel >= NOISE_THRESHOLDS.moderate) {
    return "medium";
  }

  return "low";
}

function toNoiseText(noiseLevel) {
  if (!Number.isFinite(noiseLevel)) {
    return "Noise unavailable";
  }

  if (noiseLevel >= NOISE_THRESHOLDS.loud) {
    return `Noise: Loud (${noiseLevel.toFixed(1)} dB)`;
  }

  if (noiseLevel >= NOISE_THRESHOLDS.busy) {
    return `Noise: Busy (${noiseLevel.toFixed(1)} dB)`;
  }

  if (noiseLevel >= NOISE_THRESHOLDS.moderate) {
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
 * Thresholds are defined in config/runtimeConfig.js and calibrated for
 * uncalibrated phone microphones (noise_meter).
 */
function toNoiseBand(noiseLevel) {
  if (!Number.isFinite(noiseLevel)) return null;
  if (noiseLevel < NOISE_THRESHOLDS.quiet) return 1;
  if (noiseLevel < NOISE_THRESHOLDS.moderate) return 2;
  if (noiseLevel < NOISE_THRESHOLDS.busy) return 3;
  if (noiseLevel < NOISE_THRESHOLDS.loud) return 4;
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
