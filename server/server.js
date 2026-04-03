const express = require("express");
const cors = require("cors");
require("dotenv").config();
const connectDB = require("./config/db");

// Import all route files
const authRoutes = require("./routes/authRoutes");
const locationRoutes = require("./routes/locationRoutes");
const reportRoutes = require("./routes/reportRoutes");
const cardRoutes = require("./routes/cardRoutes");
const StudyLocation = require("./models/StudyLocation");
const LocationGroup = require("./models/LocationGroup");

const app = express();

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, DELETE, OPTIONS"
  );
  next();
});


const mapAnnotations = [
  {
    id: "library-floor-1-quiet",
    lat: 28.60024,
    lng: -81.20182,
    title: "Quiet Study",
    buildingName: "John C. Hitt Library",
    floorLabel: "Floor 1",
    sublocationLabel: "North Reading Room",
    summary: "Good for focused work with light foot traffic.",
    statusText: "Usually quiet at this time",
    noiseText: "Noise: Quiet",
    occupancyText: "Occupancy: 2 users",
    updatedAtLabel: "Updated 2 minutes ago",
    iconType: "library",
    severity: "low",
    color: "#2a9d8f",
    isFavorite: true,
  },
  {
    id: "library-floor-2-moderate",
    lat: 28.60036,
    lng: -81.20168,
    title: "Collaboration Tables",
    buildingName: "John C. Hitt Library",
    floorLabel: "Floor 2",
    sublocationLabel: "West Commons",
    summary: "Conversation-friendly seating with moderate ambient sound.",
    statusText: "Moderate buzz near group tables",
    noiseText: "Noise: Moderate",
    occupancyText: "Occupancy: 9 users",
    updatedAtLabel: "Updated 4 minutes ago",
    iconType: "library",
    severity: "medium",
    color: "#ff9f1c",
  },
  {
    id: "library-floor-3-busy",
    lat: 28.60048,
    lng: -81.20155,
    title: "Open Computer Lab",
    buildingName: "John C. Hitt Library",
    floorLabel: "Floor 3",
    sublocationLabel: "Digital Media Area",
    summary: "High circulation zone with steady keyboard and discussion noise.",
    statusText: "Busiest floor in the building",
    noiseText: "Noise: Busy",
    occupancyText: "Occupancy: 18 users",
    updatedAtLabel: "Updated 1 minute ago",
    iconType: "library",
    severity: "high",
    color: "#d9485f",
  },
  {
    id: "library-floor-4-empty",
    lat: 28.60018,
    lng: -81.20198,
    title: "Silent Study Cubicles",
    buildingName: "John C. Hitt Library",
    floorLabel: "Floor 4",
    sublocationLabel: "East Quiet Wing",
    summary: "Sparse traffic and the calmest option in the library right now.",
    statusText: "Mostly empty",
    noiseText: "Noise: Very quiet",
    occupancyText: "Occupancy: 1 user",
    updatedAtLabel: "Updated 6 minutes ago",
    iconType: "library",
    severity: "low",
    color: "#2a9d8f",
    isFavorite: true,
  },
  {
    id: "msb-floor-2-moderate",
    lat: 28.60116,
    lng: -81.19886,
    title: "Study Nook",
    buildingName: "Mathematical Sciences Building",
    floorLabel: "Floor 2",
    sublocationLabel: "Atrium Balcony",
    summary: "Reliable seating between classes with moderate hallway spillover.",
    statusText: "Moderate between class blocks",
    noiseText: "Noise: Moderate",
    occupancyText: "Occupancy: 6 users",
    updatedAtLabel: "Updated 7 minutes ago",
    iconType: "study",
    severity: "medium",
    color: "#3a86ff",
  },
  {
    id: "student-union-food-court",
    lat: 28.60192,
    lng: -81.19994,
    title: "Food Court Seating",
    buildingName: "Student Union",
    floorLabel: "Level 1",
    sublocationLabel: "South Dining Hall",
    summary: "Convenient seating but consistently loud during lunch hours.",
    statusText: "Lunch rush is active",
    noiseText: "Noise: Loud",
    occupancyText: "Occupancy: 21 users",
    updatedAtLabel: "Updated just now",
    iconType: "community",
    severity: "high",
    color: "#d9485f",
  },
];

function toSeverity(noiseLevel) {
  if (!Number.isFinite(noiseLevel)) {
    return "low";
  }

  if (noiseLevel >= 68) {
    return "high";
  }

  if (noiseLevel >= 52) {
    return "medium";
  }

  return "low";
}

function toNoiseText(noiseLevel) {
  if (!Number.isFinite(noiseLevel)) {
    return "Noise unavailable";
  }

  if (noiseLevel >= 68) {
    return `Noise: Loud (${noiseLevel.toFixed(1)} dB)`;
  }

  if (noiseLevel >= 52) {
    return `Noise: Moderate (${noiseLevel.toFixed(1)} dB)`;
  }

  return `Noise: Quiet (${noiseLevel.toFixed(1)} dB)`;
}

function toOccupancyText(occupancyLevel) {
  if (!Number.isFinite(occupancyLevel)) {
    return "Occupancy unavailable";
  }

  return `Occupancy: ${occupancyLevel.toFixed(1)} / 5`;
}

function formatUpdatedAtLabel(updatedAt) {
  if (!updatedAt) {
    return "Awaiting live reports";
  }

  const elapsedMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(updatedAt).getTime()) / 60000),
  );

  if (elapsedMinutes <= 0) {
    return "Updated just now";
  }

  if (elapsedMinutes === 1) {
    return "Updated 1 minute ago";
  }

  return `Updated ${elapsedMinutes} minutes ago`;
}

function getCardsForUser(userId) {
  const normalizedUserId = Number.isInteger(userId) ? userId : Number(userId) || defaultUser.id;

  if (!cardsByUser.has(normalizedUserId)) {
    cardsByUser.set(normalizedUserId, [...baseCards]);
  }

  return cardsByUser.get(normalizedUserId);
}

// Simple request logger
app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "UP", timestamp: new Date() });
});

// Wire up API routes
app.use("/api/auth", authRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/cards", cardRoutes);

const PORT = process.env.PORT || 5050;

// This function now correctly connects to the DB ONCE before starting the server.
const startServer = async () => {
  try {
    await connectDB(); // Connect to the database first
  } catch (err) {
    const isProduction = process.env.NODE_ENV === "production";
    if (isProduction) {
      console.error("Failed to start server:", err.message);
      process.exit(1);
    }

    console.warn(
      "MongoDB unavailable. Starting in degraded local mode so fallback routes can still be tested."
    );
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
app.post("/api/login", async (req, res) => {
  const { login = "", password = "" } = req.body ?? {};
  const matchesUser =
    login.toLowerCase() === defaultUser.login && password === defaultUser.password;

  if (!matchesUser) {
    return res.status(200).json({
      id: -1,
      firstName: "",
      lastName: "",
      error: "Invalid user name/password",
    });
  }

  return res.status(200).json({
    id: defaultUser.id,
    firstName: defaultUser.firstName,
    lastName: defaultUser.lastName,
    error: "",
  });
});

app.post("/api/addcard", async (req, res) => {
  const { userId, card = "" } = req.body ?? {};
  const trimmedCard = card.trim();

  if (!trimmedCard) {
    return res.status(200).json({ error: "Card name is required" });
  }

  const userCards = getCardsForUser(userId);
  userCards.push(trimmedCard);

  return res.status(200).json({ error: "" });
});

app.post("/api/searchcards", async (req, res) => {
  const { userId, search = "" } = req.body ?? {};
  const normalizedSearch = search.toLowerCase().trim();
  const userCards = getCardsForUser(userId);

  const results = userCards.filter((card) =>
    card.toLowerCase().includes(normalizedSearch)
  );

  return res.status(200).json({ results, error: "" });
});

app.get("/api/map-annotations", async (req, res) => {
  try {
    const [locations, groups] = await Promise.all([
      StudyLocation.find().lean(),
      LocationGroup.find().lean(),
    ]);

    const locationsById = new Map(locations.map((location) => [location.studyLocationId, location]));
    const groupsById = new Map(groups.map((group) => [group.locationGroupId, group]));
    const results = mapAnnotations.map((annotation) => {
      const liveLocation = locationsById.get(annotation.id);
      if (!liveLocation) {
        return annotation;
      }

      const liveGroup = groupsById.get(liveLocation.locationGroupId);
      const liveNoise = liveLocation.currentNoiseLevel;
      const liveOccupancy = liveLocation.currentOccupancyLevel;

      return {
        ...annotation,
        buildingName: liveGroup?.name ?? annotation.buildingName,
        severity: toSeverity(liveNoise),
        noiseText: toNoiseText(liveNoise),
        occupancyText: toOccupancyText(liveOccupancy),
        statusText:
          Number.isFinite(liveNoise) && Number.isFinite(liveOccupancy)
            ? `Live estimate: ${liveNoise.toFixed(1)} dB, occupancy ${liveOccupancy.toFixed(1)} / 5`
            : annotation.statusText,
        updatedAtLabel: formatUpdatedAtLabel(liveLocation.updatedAt),
      };
    });

    res.status(200).json({
      results,
      error: "",
    });
  } catch (_error) {
    res.status(200).json({
      results: mapAnnotations,
      error: "",
    });
  }
});
