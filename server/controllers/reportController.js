const { SERVER_RUNTIME_CONFIG } = require("../config/runtimeConfig");

function createReportController({
  ReportModel,
  reportProcessingService,
} = {}) {
  const { reportsByLocationLimit, recentReportsLimit } =
    SERVER_RUNTIME_CONFIG.reports;
  const createReport = async (req, res) => {
    try {
      const {
        studyLocationId,
        studyLocationName,
        locationGroupId,
        latitude,
        longitude,
        avgNoise,
        maxNoise,
        variance,
        occupancy,
        createdAt,
      } = req.body ?? {};

      if (
        !studyLocationId ||
        avgNoise === undefined ||
        maxNoise === undefined ||
        variance === undefined ||
        occupancy === undefined
      ) {
        return res.status(400).json({ error: "Missing canonical report fields." });
      }

      const processed = await reportProcessingService.submitCanonicalReport({
        userId: req.user?.userId ?? null,
        studyLocationId,
        studyLocationName: studyLocationName ?? null,
        locationGroupId: locationGroupId ?? null,
        latitude: latitude !== undefined ? Number(latitude) : null,
        longitude: longitude !== undefined ? Number(longitude) : null,
        createdAt: createdAt ? new Date(createdAt) : new Date(),
        avgNoise: Number(avgNoise),
        maxNoise: Number(maxNoise),
        variance: Number(variance),
        occupancy: Number(occupancy),
      });

      return res.status(201).json(processed);
    } catch (error) {
      return res.status(500).json({
        error: "Server error while creating report.",
        details: error.message,
      });
    }
  };

  const getReportsByLocation = async (req, res) => {
    try {
      const reports = await ReportModel.find({
        studyLocationId: req.params.locationId,
        reportKind: "live",
      })
        .sort({ createdAt: -1 })
        .limit(reportsByLocationLimit);

      return res.status(200).json(reports);
    } catch (_error) {
      return res.status(500).json({ error: "Server error fetching reports." });
    }
  };

  const getRecentReports = async (_req, res) => {
    try {
      const reports = await ReportModel.find({ reportKind: "live" })
        .sort({ createdAt: -1 })
        .limit(recentReportsLimit);

      return res.status(200).json(reports);
    } catch (_error) {
      return res.status(500).json({ error: "Server error fetching recent reports." });
    }
  };

  const getReportHistory = async (req, res) => {
    try {
      const from = req.query.from ? new Date(req.query.from) : null;
      const to = req.query.to ? new Date(req.query.to) : null;

      if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
        return res.status(400).json({ error: "Invalid history date range." });
      }

      const summaries = await reportProcessingService.listArchivedSummariesByLocation(
        req.params.locationId,
        {
          from,
          to,
          limit: req.query.limit,
        },
      );

      return res.status(200).json(summaries);
    } catch (_error) {
      return res.status(500).json({ error: "Server error fetching report history." });
    }
  };

  const getHistoricalBaseline = async (req, res) => {
    try {
      const at = req.query.at ? new Date(req.query.at) : new Date();

      if (Number.isNaN(at.getTime())) {
        return res.status(400).json({ error: "Invalid 'at' date parameter." });
      }

      const baseline = await reportProcessingService.getHistoricalBaseline(
        req.params.locationId,
        at,
      );

      if (!baseline) {
        return res.status(200).json({ usualNoise: null, usualOccupancy: null });
      }

      return res.status(200).json(baseline);
    } catch (_error) {
      return res.status(500).json({ error: "Server error fetching historical baseline." });
    }
  };

  return {
    createReport,
    getReportsByLocation,
    getRecentReports,
    getReportHistory,
    getHistoricalBaseline,
  };
}

module.exports = createReportController;