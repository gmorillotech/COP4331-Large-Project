const express = require("express");
const cors = require("cors");
require("dotenv").config();
//const connectDB = require("./config/db"); // DB not properly initialized yet

const app = express();

//connectDB(); // DB credentials not setup yet

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.status(200).json({ message: "API is running" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});