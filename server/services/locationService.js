class LocationService {
  constructor(studyLocationRepository, locationGroupRepository, maxResolutionDistanceMeters = 150) {
    this.studyLocationRepository = studyLocationRepository;
    this.locationGroupRepository = locationGroupRepository;
    this.maxResolutionDistanceMeters = maxResolutionDistanceMeters;
  }

  async getAllGroups() {
    const groups = await this.locationGroupRepository.getAllLocationGroups();
    return [...groups].sort((left, right) => left.name.localeCompare(right.name));
  }

  async listLocationsByGroup(groupId) {
    const locations = await this.studyLocationRepository.getAllStudyLocations();
    return locations
      .filter((location) => location.locationGroupId === groupId)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async getLocationById(locationId) {
    const location = await this.studyLocationRepository.getStudyLocationById(locationId);

    if (!location) {
      throw new Error(`StudyLocation not found for id ${locationId}`);
    }

    return location;
  }

  async getLocationGroup(locationId) {
    const location = await this.getLocationById(locationId);
    const group = await this.locationGroupRepository.getLocationGroupById(location.locationGroupId);

    if (!group) {
      throw new Error(`LocationGroup not found for id ${location.locationGroupId}`);
    }

    return group;
  }

  async getClosestLocation(coords) {
    const studyLocations = await this.studyLocationRepository.getAllStudyLocations();

    if (studyLocations.length === 0) {
      throw new Error("No study locations are configured");
    }

    let closestLocation = null;
    let closestDistanceMeters = Number.POSITIVE_INFINITY;

    for (const location of studyLocations) {
      const distanceMeters = haversineDistanceMeters(coords, {
        latitude: location.latitude,
        longitude: location.longitude,
      });

      if (distanceMeters < closestDistanceMeters) {
        closestLocation = location;
        closestDistanceMeters = distanceMeters;
      }
    }

    if (!closestLocation || closestDistanceMeters > this.maxResolutionDistanceMeters) {
      throw new Error("No study location found within the allowed resolution distance");
    }

    return closestLocation;
  }
}

function haversineDistanceMeters(a, b) {
  const earthRadiusMeters = 6_371_000;
  const latitudeDeltaRadians = toRadians(b.latitude - a.latitude);
  const longitudeDeltaRadians = toRadians(b.longitude - a.longitude);
  const aLatitudeRadians = toRadians(a.latitude);
  const bLatitudeRadians = toRadians(b.latitude);

  const haversineComponent =
    Math.sin(latitudeDeltaRadians / 2) ** 2 +
    Math.cos(aLatitudeRadians) *
      Math.cos(bLatitudeRadians) *
      Math.sin(longitudeDeltaRadians / 2) ** 2;

  const angularDistance =
    2 * Math.atan2(Math.sqrt(haversineComponent), Math.sqrt(1 - haversineComponent));

  return earthRadiusMeters * angularDistance;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

module.exports = {
  LocationService,
};
