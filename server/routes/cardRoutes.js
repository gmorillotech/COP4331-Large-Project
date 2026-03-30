
const express = require("express");
const router = express.Router();
const { addCard, searchCards } = require("../controllers/cardController");

router.post("/addCard", addCard);
router.post("/searchCards", searchCards);

module.exports = router;