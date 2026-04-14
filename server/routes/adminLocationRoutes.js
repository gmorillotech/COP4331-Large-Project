const express = require("express");
const { protect, requireAdmin } = require("../middleware/authMiddleware");
const { adminDeleteRateLimiter } = require("../middleware/adminRateLimit");
const { updateGroupShape, mergeGroups, splitGroup, deleteGroup } = require("../controllers/adminLocationController");

const router = express.Router();

// All admin routes require authentication + admin role
router.use(protect, requireAdmin);

// PUT /api/admin/location-groups/:groupId/shape
router.put("/location-groups/:groupId/shape", updateGroupShape);

// POST /api/admin/location-groups/merge
router.post("/location-groups/merge", mergeGroups);

// POST /api/admin/location-groups/:groupId/split
router.post("/location-groups/:groupId/split", splitGroup);

// DELETE /api/admin/location-groups/:groupId
router.delete("/location-groups/:groupId", adminDeleteRateLimiter, deleteGroup);

module.exports = router;
