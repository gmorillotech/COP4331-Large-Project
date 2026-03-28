const express = require("express");
const cors = require("cors");
require("dotenv").config();

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

function getCardsForUser(userId) {
  const normalizedUserId = Number.isInteger(userId) ? userId : Number(userId) || defaultUser.id;

  if (!cardsByUser.has(normalizedUserId)) {
    cardsByUser.set(normalizedUserId, [...baseCards]);
  }

  return cardsByUser.get(normalizedUserId);
}

app.get("/api/health", (req, res) => {
  res.status(200).json({ message: "API is running" });
});

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

app.get("/api/map-annotations", (req, res) => {
  res.status(200).json({
    results: mapAnnotations,
    error: "",
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
