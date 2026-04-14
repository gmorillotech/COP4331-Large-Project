const express = require("express");
const { protect, requireAdmin } = require("../middleware/authMiddleware");
const { adminDeleteRateLimiter } = require("../middleware/adminRateLimit");
const adminSearchController = require("../controllers/adminSearchController");

function createAdminSearchRouter({
  protectMiddleware = protect,
  requireAdminMiddleware = requireAdmin,
  controller = adminSearchController,
  deleteRateLimiter = adminDeleteRateLimiter,
} = {}) {
  const router = express.Router();

  router.use(protectMiddleware, requireAdminMiddleware);

  router.get("/search", controller.search);
  router.get("/reports/active", controller.getActiveReports);
  router.delete("/reports/:reportId", deleteRateLimiter, controller.deleteReport);

  return router;
}

module.exports = createAdminSearchRouter();
module.exports.createAdminSearchRouter = createAdminSearchRouter;
