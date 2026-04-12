const LocationGroup = require("../models/LocationGroup");
const StudyLocation = require("../models/StudyLocation");

async function loadSearchSource({
  StudyLocationModel = StudyLocation,
  LocationGroupModel = LocationGroup,
} = {}) {
  const [locations, groups] = await Promise.all([
    StudyLocationModel.find().lean(),
    LocationGroupModel.find().lean(),
  ]);

  return { locations, groups, source: "database" };
}

module.exports = {
  loadSearchSource,
};
