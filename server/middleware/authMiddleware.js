const jwt = require("jsonwebtoken");

const User = require("../models/User");

const attachUserFromBearerToken = async (req) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer")) {
    return null;
  }

  const token = req.headers.authorization.split(" ")[1];
  const decodedPayload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  const user = await User.findOne({ userId: decodedPayload.userId }).select("-passwordHash");
  if (!user) {
    return null;
  }

  const tokenIssuedAtMs = typeof decodedPayload.iat === "number" ? decodedPayload.iat * 1000 : null;
  const passwordChangedAtMs =
    user.passwordChangedAt instanceof Date ? user.passwordChangedAt.getTime() : null;

  if (
    tokenIssuedAtMs == null ||
    (passwordChangedAtMs != null && tokenIssuedAtMs < passwordChangedAtMs)
  ) {
    throw new Error("Token predates latest password change");
  }

  return user;
};

const protect = async (req, res, next) => {
  try {
    const user = await attachUserFromBearerToken(req);
    if (!user) {
      return res.status(401).json({ error: "Not authorized, no token provided" });
    }

    req.user = user;
    return next();
  } catch (_error) {
    return res.status(401).json({ error: "Not authorized, token failed" });
  }
};

const optionalProtect = async (req, _res, next) => {
  try {
    const user = await attachUserFromBearerToken(req);
    if (user) {
      req.user = user;
    }
  } catch (_error) {
    req.user = null;
  }

  return next();
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden: admin access required" });
  }
  return next();
};

module.exports = { protect, optionalProtect, requireAdmin };
