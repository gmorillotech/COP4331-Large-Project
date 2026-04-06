const express = require("express");
const router = express.Router();
const { protect, requireAdmin } = require("../middleware/authMiddleware");
const {
  search,
  getActiveReports,
  deleteReport,
} = require("../controllers/adminSearchController");

router.use(protect, requireAdmin);

router.get("/search", search);
router.get("/reports/active", getActiveReports);
router.delete("/reports/:reportId", deleteReport);

module.exports = router;
