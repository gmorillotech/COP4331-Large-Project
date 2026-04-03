const locationGroups = [
  {
    locationGroupId: "group-john-c-hitt-library",
    name: "John C. Hitt Library",
  },
  {
    locationGroupId: "group-mathematical-sciences-building",
    name: "Mathematical Sciences Building",
  },
  {
    locationGroupId: "group-student-union",
    name: "Student Union",
  },
];

const studyLocations = [
  {
    studyLocationId: "library-floor-1-quiet",
    locationGroupId: "group-john-c-hitt-library",
    name: "Quiet Study",
    floorLabel: "Floor 1",
    sublocationLabel: "North Reading Room",
    latitude: 28.60024,
    longitude: -81.20182,
  },
  {
    studyLocationId: "library-floor-2-moderate",
    locationGroupId: "group-john-c-hitt-library",
    name: "Collaboration Tables",
    floorLabel: "Floor 2",
    sublocationLabel: "West Commons",
    latitude: 28.60036,
    longitude: -81.20168,
  },
  {
    studyLocationId: "library-floor-3-busy",
    locationGroupId: "group-john-c-hitt-library",
    name: "Open Computer Lab",
    floorLabel: "Floor 3",
    sublocationLabel: "Digital Media Area",
    latitude: 28.60048,
    longitude: -81.20155,
  },
  {
    studyLocationId: "library-floor-4-empty",
    locationGroupId: "group-john-c-hitt-library",
    name: "Silent Study Cubicles",
    floorLabel: "Floor 4",
    sublocationLabel: "East Quiet Wing",
    latitude: 28.60018,
    longitude: -81.20198,
  },
  {
    studyLocationId: "msb-floor-2-moderate",
    locationGroupId: "group-mathematical-sciences-building",
    name: "Study Nook",
    floorLabel: "Floor 2",
    sublocationLabel: "Atrium Balcony",
    latitude: 28.60116,
    longitude: -81.19886,
  },
  {
    studyLocationId: "student-union-food-court",
    locationGroupId: "group-student-union",
    name: "Food Court Seating",
    floorLabel: "Level 1",
    sublocationLabel: "South Dining Hall",
    latitude: 28.60192,
    longitude: -81.19994,
  },
];

function findCatalogLocation(studyLocationId) {
  return studyLocations.find((location) => location.studyLocationId === studyLocationId) ?? null;
}

function findCatalogGroup(locationGroupId) {
  return locationGroups.find((group) => group.locationGroupId === locationGroupId) ?? null;
}

module.exports = {
  locationGroups,
  studyLocations,
  findCatalogLocation,
  findCatalogGroup,
};
