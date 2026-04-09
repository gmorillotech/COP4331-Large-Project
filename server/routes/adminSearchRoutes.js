const express = require("express");
const { protect, requireAdmin } = require("../middleware/authMiddleware");
const adminSearchController = require("../controllers/adminSearchController");

function createAdminSearchRouter({
  protectMiddleware = protect,
  requireAdminMiddleware = requireAdmin,
  controller = adminSearchController,
} = {}) {
  const router = express.Router();

  router.use(protectMiddleware, requireAdminMiddleware);

  router.get("/search", controller.search);
  router.get("/reports/active", controller.getActiveReports);
  router.delete("/reports/:reportId", controller.deleteReport);

  return router;
}

module.exports = createAdminSearchRouter();
module.exports.createAdminSearchRouter = createAdminSearchRouter;
