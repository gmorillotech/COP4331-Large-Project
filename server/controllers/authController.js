const User = require("../models/User");
const token = require("../createJWT");

const login = async (req, res) => {
  try {
    const { login, password } = req.body || {};

    if (!login || !password) {
      return res.status(400).json({
        error: "Missing login or password",
      });
    }

    const results = await User.find({
      login,
      password,
    });

    if (results && results.length > 0) {
      const id = results[0]._id.toString();
      const fn = results[0].firstName;
      const ln = results[0].lastName;

      const ret = token.createToken(fn, ln, id);
      return res.status(200).json(ret);
    }

    return res.status(200).json({
      error: "Invalid user name/password",
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
};

module.exports = { login };