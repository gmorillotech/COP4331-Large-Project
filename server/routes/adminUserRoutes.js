const express = require("express");

const { protect, requireAdmin } = require("../middleware/authMiddleware");
const { adminDeleteRateLimiter } = require("../middleware/adminRateLimit");
const adminUserController = require("../controllers/adminUserController");

const router = express.Router();

// All routes require authentication + admin role
router.use(protect, requireAdmin);

router.get("/", adminUserController.listUsers);
router.patch("/:userId", adminUserController.editUser);
router.post("/:userId/force-password-reset", adminUserController.forcePasswordReset);
router.delete("/:userId", adminDeleteRateLimiter, adminUserController.deleteUser);

module.exports = router;
