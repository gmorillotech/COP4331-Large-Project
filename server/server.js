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
const {
  baseLocationAnnotations,
  baseLocationAnnotationsById,
  formatUpdatedAtLabel,
  toNoiseText,
  toOccupancyText,
  toSeverity,
} = require("./services/mapSearchData");
const { loadSearchSource } = require("./services/locationSearchSource");

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

const defaultUser = {
  id: 1,
  login: "rickl",
  password: "COP4331",
  firstName: "Rick",
  lastName: "Leinecker",
};

const baseCards = [
  "Roy Campanella",
  "Paul Molitor",
  "Tony Gwynn",
  "Dennis Eckersley",
  "Reggie Jackson",
  "Gaylord Perry",
  "Buck Leonard",
  "Rollie Fingers",
  "Charlie Gehringer",
  "Wade Boggs",
  "Carl Hubbell",
  "Dave Winfield",
  "Jackie Robinson",
  "Ken Griffey, Jr.",
  "Al Simmons",
  "Chuck Klein",
  "Mel Ott",
  "Mark McGwire",
  "Nolan Ryan",
  "Ralph Kiner",
  "Yogi Berra",
  "Goose Goslin",
  "Greg Maddux",
  "Frankie Frisch",
  "Ernie Banks",
  "Ozzie Smith",
  "Hank Greenberg",
  "Kirby Puckett",
  "Bob Feller",
  "Dizzy Dean",
  "Joe Jackson",
  "Sam Crawford",
  "Barry Bonds",
  "Duke Snider",
  "George Sisler",
  "Ed Walsh",
  "Tom Seaver",
  "Willie Stargell",
  "Bob Gibson",
  "Brooks Robinson",
  "Steve Carlton",
  "Joe Medwick",
  "Nap Lajoie",
  "Cal Ripken, Jr.",
  "Mike Schmidt",
  "Eddie Murray",
  "Tris Speaker",
  "Al Kaline",
  "Sandy Koufax",
  "Willie Keeler",
  "Pete Rose",
  "Robin Roberts",
  "Eddie Collins",
  "Lefty Gomez",
  "Lefty Grove",
  "Carl Yastrzemski",
  "Frank Robinson",
  "Juan Marichal",
  "Warren Spahn",
  "Pie Traynor",
  "Roberto Clemente",
  "Harmon Killebrew",
  "Satchel Paige",
  "Eddie Plank",
  "Josh Gibson",
  "Oscar Charleston",
  "Mickey Mantle",
  "Cool Papa Bell",
  "Johnny Bench",
  "Mickey Cochrane",
  "Jimmie Foxx",
  "Jim Palmer",
  "Cy Young",
  "Eddie Mathews",
  "Honus Wagner",
  "Paul Waner",
  "Grover Alexander",
  "Rod Carew",
  "Joe DiMaggio",
  "Joe Morgan",
  "Stan Musial",
  "Bill Terry",
  "Rogers Hornsby",
  "Lou Brock",
  "Ted Williams",
  "Bill Dickey",
  "Christy Mathewson",
  "Willie McCovey",
  "Lou Gehrig",
  "George Brett",
  "Hank Aaron",
  "Harry Heilmann",
  "Walter Johnson",
  "Roger Clemens",
  "Ty Cobb",
  "Whitey Ford",
  "Willie Mays",
  "Rickey Henderson",
  "Babe Ruth",
];

const cardsByUser = new Map([[defaultUser.id, [...baseCards]]]);
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
    const sourceData = await loadSearchSource({
      StudyLocationModel: StudyLocation,
      LocationGroupModel: LocationGroup,
    });
    const locationsById = new Map(
      sourceData.locations.map((location) => [location.studyLocationId, location]),
    );
    const groupsById = new Map(
      sourceData.groups.map((group) => [group.locationGroupId, group]),
    );
    const results = baseLocationAnnotations.map((annotation) => {
      const liveLocation = locationsById.get(annotation.id);
      if (!liveLocation) {
        return annotation;
      }

      const liveGroup = groupsById.get(liveLocation.locationGroupId);
      const liveNoise = Number.isFinite(liveLocation.currentNoiseLevel)
        ? liveLocation.currentNoiseLevel
        : (annotation.noiseValue ?? null);
      const liveOccupancy = Number.isFinite(liveLocation.currentOccupancyLevel)
        ? liveLocation.currentOccupancyLevel
        : (annotation.occupancyValue ?? null);
      const baseAnnotation = baseLocationAnnotationsById.get(annotation.id) ?? annotation;

      return {
        ...baseAnnotation,
        buildingName: liveGroup?.name ?? baseAnnotation.buildingName,
        severity: Number.isFinite(liveNoise) ? toSeverity(liveNoise) : baseAnnotation.severity,
        noiseText: Number.isFinite(liveLocation.currentNoiseLevel)
          ? toNoiseText(liveLocation.currentNoiseLevel)
          : baseAnnotation.noiseText,
        occupancyText: Number.isFinite(liveLocation.currentOccupancyLevel)
          ? toOccupancyText(liveLocation.currentOccupancyLevel)
          : baseAnnotation.occupancyText,
        statusText:
          Number.isFinite(liveLocation.currentNoiseLevel) &&
          Number.isFinite(liveLocation.currentOccupancyLevel)
            ? `Live estimate: ${liveLocation.currentNoiseLevel.toFixed(1)} dB, occupancy ${liveLocation.currentOccupancyLevel.toFixed(1)} / 5`
            : baseAnnotation.statusText,
        updatedAtLabel: liveLocation.updatedAt
          ? formatUpdatedAtLabel(liveLocation.updatedAt)
          : baseAnnotation.updatedAtLabel,
      };
    });

    res.status(200).json({
      results,
      error: "",
      source: sourceData.source,
    });
  } catch (_error) {
    res.status(200).json({
      results: baseLocationAnnotations,
      error: "",
      source: "catalog",
    });
  }
});
