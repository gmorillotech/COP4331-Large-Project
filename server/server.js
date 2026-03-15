const express = require("express");
const cors = require("cors");
require("dotenv").config();
const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const cardRoutes = require("./routes/cardRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);
  next();
});

app.get("/api/health", (req, res) => {
  console.log("Health route hit");
  res.status(200).json({ message: "API is running" });
});

app.use("/api", authRoutes);
app.use("/api", cardRoutes);

const PORT = process.env.PORT || 5050;

const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err.message);
  }
};

startServer();