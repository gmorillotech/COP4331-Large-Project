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
      const reports = await ReportModel.find({ studyLocationId: req.params.locationId })
        .sort({ createdAt: -1 })
        .limit(20);
      return res.status(200).json(reports);
    } catch (_error) {
      return res.status(500).json({ error: "Server error fetching reports." });
    }
  });

  router.get("/recent", async (_req, res) => {
    try {
      const reports = await ReportModel.find().sort({ createdAt: -1 }).limit(15);
      return res.status(200).json(reports);
    } catch (_error) {
      return res.status(500).json({ error: "Server error fetching recent reports." });
    }
  });

  return router;
}

module.exports = createReportRouter();
module.exports.createReportRouter = createReportRouter;
