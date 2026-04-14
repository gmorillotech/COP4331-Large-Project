const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

// Limits destructive admin actions (DELETE user / report / location group)
// to a conservative burst. Keyed by the authenticated admin userId when
// available, falling back to IP. Disabled under NODE_ENV=test so the
// Supertest suite is not throttled.
const adminDeleteRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  keyGenerator: (req, res) => (req.user && req.user.userId) || ipKeyGenerator(req, res),
  message: {
    error: "Too many admin delete requests. Slow down and try again shortly.",
  },
});

module.exports = { adminDeleteRateLimiter };
