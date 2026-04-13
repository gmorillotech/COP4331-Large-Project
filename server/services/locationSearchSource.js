const LocationGroup = require("../models/LocationGroup");
const StudyLocation = require("../models/StudyLocation");

async function loadSearchSource({
  StudyLocationModel = StudyLocation,
  LocationGroupModel = LocationGroup,
} = {}) {
  try {
    const [locationDocs, groupDocs] = await Promise.all([
      StudyLocationModel.find().lean(),
      LocationGroupModel.find().lean(),
    ]);
    return {
      locations: locationDocs,
      groups: groupDocs,
      source: "database",
    };
  } catch (_error) {
    return {
      locations: [],
      groups: [],
      source: "database",
    };
  }
}

module.exports = {
  loadSearchSource,
};
