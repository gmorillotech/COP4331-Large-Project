const express = require("express");

const Report = require("../models/Report");
const { optionalProtect, protect } = require("../middleware/authMiddleware");
const { ReportProcessingService } = require("../services/reportProcessingService");
const createReportController = require("../controllers/reportController");

function createReportRouter({
  ReportModel = Report,
  optionalProtectMiddleware = optionalProtect,
  protectMiddleware = protect,
  reportProcessingService = new ReportProcessingService(),
} = {}) {
  const router = express.Router();

  const reportController = createReportController({
    ReportModel,
    reportProcessingService,
  });
  
  router.post("/", optionalProtectMiddleware, reportController.createReport);

  router.use(protectMiddleware);
  
  router.get("/location/:locationId", reportController.getReportsByLocation);
  router.get("/recent", reportController.getRecentReports);
  router.get("/history/:locationId", reportController.getReportHistory);
  router.get("/baseline/:locationId", reportController.getHistoricalBaseline);

  return router;
}

module.exports = createReportRouter();
module.exports.createReportRouter = createReportRouter;
