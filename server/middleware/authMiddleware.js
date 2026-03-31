const jwt = require("jsonwebtoken");

const User = require("../models/User");

const attachUserFromBearerToken = async (req) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer")) {
    return null;
  }

  const token = req.headers.authorization.split(" ")[1];
  const decodedPayload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  return User.findOne({ userId: decodedPayload.userId }).select("-passwordHash");
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

module.exports = { protect, optionalProtect };
