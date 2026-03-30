const Card = require("../models/Card");
const token = require("../createJWT");

const addCard = async (req, res) => {
  try {
    const { userId, card, jwtToken } = req.body;

    if (!jwtToken) {
      return res.status(401).json({
        error: "Missing JWT",
        jwtToken: "",
      });
    }

    if (token.isExpired(jwtToken)) {
      return res.status(200).json({
        error: "The JWT is no longer valid",
        jwtToken: "",
      });
    }

    const newCard = new Card({
      userId,
      card,
    });

    await newCard.save();

    const refreshedToken = token.refresh(jwtToken);

    return res.status(200).json({
      error: "",
      jwtToken: refreshedToken,
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
      jwtToken: "",
    });
  }
};

const searchCards = async (req, res) => {
  try {
    const { userId, search, jwtToken } = req.body;

    if (!jwtToken) {
      return res.status(401).json({
        results: [],
        error: "Missing JWT",
        jwtToken: "",
      });
    }

    if (token.isExpired(jwtToken)) {
      return res.status(200).json({
        results: [],
        error: "The JWT is no longer valid",
        jwtToken: "",
      });
    }

    const results = await Card.find({
      userId,
      card: { $regex: search.trim() + ".*", $options: "i" },
    });

    const ret = results.map((item) => item.card);
    const refreshedToken = token.refresh(jwtToken);

    return res.status(200).json({
      results: ret,
      error: "",
      jwtToken: refreshedToken,
    });
  } catch (err) {
    return res.status(500).json({
      results: [],
      error: err.message,
      jwtToken: "",
    });
  }
};

module.exports = { addCard, searchCards };