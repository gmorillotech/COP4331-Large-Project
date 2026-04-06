const express = require("express");
const { protect, requireAdmin } = require("../middleware/authMiddleware");
const { updateGroupShape, mergeGroups } = require("../controllers/adminLocationController");

const router = express.Router();

// All admin routes require authentication + admin role
router.use(protect);
router.use(requireAdmin);

// PUT /api/admin/location-groups/:groupId/shape
router.put("/location-groups/:groupId/shape", updateGroupShape);

// POST /api/admin/location-groups/merge
router.post("/location-groups/merge", mergeGroups);

module.exports = router;
