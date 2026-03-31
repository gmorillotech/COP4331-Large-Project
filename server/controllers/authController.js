const bcrypt = require("bcryptjs");

const User = require("../models/User");
const token = require("../createJWT");

const login = async (req, res) => {
  try {
    const { login, password } = req.body ?? {};

    if (!login || !password) {
      return res.status(400).json({
        error: "Missing login or password",
      });
    }

    const user = await User.findOne({ login: login.trim().toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({
        error: "Invalid user name/password",
      });
    }

    const ret = token.createToken(user.firstName, user.lastName, user.userId);
    return res.status(200).json({
      accessToken: ret.accessToken,
      userId: user.userId,
      firstName: user.firstName,
      lastName: user.lastName,
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
};

module.exports = { login };
