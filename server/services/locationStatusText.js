const { toNoiseBand } = require("./mapSearchData");

function buildLiveStatusText(liveNoise, liveOccupancy) {
  if (Number.isFinite(liveNoise) && Number.isFinite(liveOccupancy)) {
    return `Live estimate: ${liveNoise.toFixed(1)} dB, occupancy ${liveOccupancy.toFixed(1)} / 5`;
  }

  return "Awaiting live reports";
}

function buildHistoricalStatusText(historicalBaseline) {
  const usualNoise = historicalBaseline?.usualNoise;
  if (!Number.isFinite(usualNoise)) {
    return null;
  }

  switch (toNoiseBand(usualNoise)) {
    case 1:
    case 2:
      return "Usually quiet at this time";
    case 3:
      return "Usually moderate at this time";
    case 4:
      return "Usually busy at this time";
    case 5:
      return "Usually loud at this time";
    default:
      return null;
  }
}

function buildLocationStatusText({
  historicalBaseline = null,
  liveNoise = null,
  liveOccupancy = null,
} = {}) {
  return (
    buildHistoricalStatusText(historicalBaseline) ??
    buildLiveStatusText(liveNoise, liveOccupancy)
  );
}

async function loadHistoricalBaselines(
  locations,
  reportProcessingService,
  now = new Date(),
) {
  if (
    !reportProcessingService ||
    typeof reportProcessingService.getHistoricalBaseline !== "function" ||
    locations.length === 0
  ) {
    return new Map();
  }

  const baselines = await Promise.all(
    locations.map(async (location) => {
      try {
        const baseline = await reportProcessingService.getHistoricalBaseline(
          location.studyLocationId,
          now,
        );
        return [location.studyLocationId, baseline];
      } catch (_error) {
        return [location.studyLocationId, null];
      }
    }),
  );

  return new Map(baselines);
}

module.exports = {
  buildHistoricalStatusText,
  buildLocationStatusText,
  buildLiveStatusText,
  loadHistoricalBaselines,
};
