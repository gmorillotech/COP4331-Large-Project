const Card = require("../models/Card");

const addCard = async (req, res) => {
  try {
    const { userId, card } = req.body;

    const newCard = new Card({
      userId,
      card,
    });

    await newCard.save();

    return res.status(200).json({ error: "" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const searchCards = async (req, res) => {
  try {
    const { userId, search } = req.body;
    const _search = search.trim();

    const results = await Card.find({
      userId,
      card: { $regex: _search + ".*", $options: "i" },
    });

    const ret = results.map((item) => item.card);

    return res.status(200).json({
      results: ret,
      error: "",
    });
  } catch (err) {
    return res.status(500).json({
      results: [],
      error: err.message,
    });
  }
};

module.exports = { addCard, searchCards };