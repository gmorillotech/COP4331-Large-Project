const express = require("express");

const Report = require("../models/Report");
const { optionalProtect, protect } = require("../middleware/authMiddleware");
const { ReportProcessingService } = require("../services/reportProcessingService");

function createReportRouter({
  ReportModel = Report,
  optionalProtectMiddleware = optionalProtect,
  protectMiddleware = protect,
  reportProcessingService = new ReportProcessingService(),
} = {}) {
  const router = express.Router();

  router.post("/", optionalProtectMiddleware, async (req, res) => {
    try {
      const {
        studyLocationId,
        avgNoise,
        maxNoise,
        variance,
        occupancy,
        createdAt,
        userId: bodyUserId,
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
        userId: req.user?.userId ?? bodyUserId ?? "local-user",
        studyLocationId,
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
  });

  router.use(protectMiddleware);

  router.get("/location/:locationId", async (req, res) => {
    try {
      const reports = await ReportModel.find({
        studyLocationId: req.params.locationId,
        reportKind: "live",
      })
        .sort({ createdAt: -1 })
        .limit(20);
      return res.status(200).json(reports);
    } catch (_error) {
      return res.status(500).json({ error: "Server error fetching reports." });
    }
  });

  router.get("/recent", async (_req, res) => {
    try {
      const reports = await ReportModel.find({ reportKind: "live" })
        .sort({ createdAt: -1 })
        .limit(15);
      return res.status(200).json(reports);
    } catch (_error) {
      return res.status(500).json({ error: "Server error fetching recent reports." });
    }
  });

  router.get("/history/:locationId", async (req, res) => {
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
  });

  router.get("/baseline/:locationId", async (req, res) => {
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
  });

  return router;
}

module.exports = createReportRouter();
module.exports.createReportRouter = createReportRouter;
