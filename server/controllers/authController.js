const User = require("../models/User");

const login = async (req, res) => {
  try {
    const { login, password } = req.body || {};

    if (!login || !password) {
      return res.status(400).json({
        id: -1,
        firstName: "",
        lastName: "",
        error: "Missing login or password",
      });
    }

    const results = await User.find({
      login: login,
      password: password,
    });

    let id = -1;
    let fn = "";
    let ln = "";
    let error = "";

    if (results && results.length > 0) {
      id = results[0]._id;
      fn = results[0].firstName;
      ln = results[0].lastName;
    } else {
      error = "Invalid user name/password";
    }

    return res.status(200).json({
      id,
      firstName: fn,
      lastName: ln,
      error,
    });
  } catch (err) {
    return res.status(500).json({
      id: -1,
      firstName: "",
      lastName: "",
      error: err.message,
    });
  }
};

module.exports = { login };