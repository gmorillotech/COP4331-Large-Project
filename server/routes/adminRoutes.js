const express = require("express");
const router = express.Router();
const { protect, requireAdmin } = require("../middleware/authMiddleware");

router.use(protect, requireAdmin);

router.get("/", (req, res) => {
  res.status(200).json({ message: "Admin API" });
});

module.exports = router;
