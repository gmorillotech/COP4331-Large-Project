const {
  isClosedPolygon,
  pointInPolygon,
  pointOnPolygonBoundary,
} = require("./geometryValidation");
const { SERVER_RUNTIME_CONFIG } = require("../config/runtimeConfig");

class LocationService {
  constructor(
    studyLocationRepository,
    locationGroupRepository,
    maxResolutionDistanceMeters = SERVER_RUNTIME_CONFIG.location.nearestResolutionDistanceMeters,
  ) {
    this.studyLocationRepository = studyLocationRepository;
    this.locationGroupRepository = locationGroupRepository;
    this.maxResolutionDistanceMeters = maxResolutionDistanceMeters;
    this.locationGroupPaddingMeters =
      SERVER_RUNTIME_CONFIG.location.locationGroupPaddingMeters;
    this.minimumLocationGroupRadiusMeters =
      SERVER_RUNTIME_CONFIG.location.minimumLocationGroupRadiusMeters;
    this.userCreatedLocationGroupRadiusMeters =
      SERVER_RUNTIME_CONFIG.location.defaultUserCreatedLocationGroupRadiusMeters;
    this.duplicateLocationRadiusMeters =
      SERVER_RUNTIME_CONFIG.location.duplicateLocationRadiusMeters;
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

  async createLocationInGroup(groupId, input) {
    const group = await this.locationGroupRepository.getLocationGroupById(groupId);
    if (!group) {
      throw new Error(`LocationGroup not found for id ${groupId}`);
    }

    const name = String(input.name ?? "").trim();
    const floorLabel = String(input.floorLabel ?? "").trim();
    const sublocationLabel = String(input.sublocationLabel ?? "").trim();
    const description = String(input.description ?? "").trim();
    const latitude = Number(input.latitude);
    const longitude = Number(input.longitude);

    if (!name) {
      throw new Error("Study location name is required.");
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error("Latitude and longitude must be valid numbers.");
    }

    const boundary = await this.getGroupBoundary(groupId);
    if (!isWithinBoundary(boundary, { latitude, longitude })) {
      throw new Error("New study locations must be created from inside the selected location group boundary.");
    }

    const existingLocations = await this.listLocationsByGroup(groupId);
    const normalizedName = normalizeIdComponent(name);
    const duplicate = existingLocations.find((location) =>
      normalizeIdComponent(location.name) === normalizedName &&
      haversineDistanceMeters(
        { latitude, longitude },
        { latitude: location.latitude, longitude: location.longitude },
      ) <= this.duplicateLocationRadiusMeters,
    );

    if (duplicate) {
      throw new Error("A nearby study location with the same name already exists in this group.");
    }

    const studyLocationId = await this._buildUniqueStudyLocationId(
      group,
      name,
      existingLocations,
    );

    return this.studyLocationRepository.createStudyLocation({
      studyLocationId,
      locationGroupId: groupId,
      name,
      floorLabel,
      sublocationLabel,
      description,
      latitude,
      longitude,
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    });
  }

  async createLocationGroup(input) {
    const name = String(input.name ?? "").trim();
    const centerLatitude = Number(input.centerLatitude);
    const centerLongitude = Number(input.centerLongitude);
    const creatorLatitude = Number(input.creatorLatitude);
    const creatorLongitude = Number(input.creatorLongitude);

    if (!name) {
      throw new Error("Location group name is required.");
    }

    if (!Number.isFinite(centerLatitude) || !Number.isFinite(centerLongitude)) {
      throw new Error("Group center latitude and longitude must be valid numbers.");
    }

    if (!Number.isFinite(creatorLatitude) || !Number.isFinite(creatorLongitude)) {
      throw new Error("Creator latitude and longitude must be valid numbers.");
    }

    const existingGroups = await this.locationGroupRepository.getAllLocationGroups();
    const containingGroups = [];
    for (const group of existingGroups) {
      const boundary = await this._tryGetGroupBoundary(group.locationGroupId);
      if (!boundary) {
        continue;
      }

      if (isWithinBoundary(boundary, { latitude: creatorLatitude, longitude: creatorLongitude })) {
        containingGroups.push(group);
      }
    }

    if (containingGroups.length > 0) {
      throw new Error("You are already inside an existing location group. Choose that group instead of creating a new one.");
    }

    const proposedBoundary = {
      shapeType: "polygon",
      polygon: buildRegularHexagonBoundary({
        centerLatitude,
        centerLongitude,
        apothemMeters: this.userCreatedLocationGroupRadiusMeters,
      }),
      centerLatitude,
      centerLongitude,
      radiusMeters: this.userCreatedLocationGroupRadiusMeters,
    };
    if (!isWithinBoundary(proposedBoundary, { latitude: creatorLatitude, longitude: creatorLongitude })) {
      throw new Error("You must be standing inside the new location group boundary to create it.");
    }

    const locationGroupId = await this._buildUniqueLocationGroupId(
      name,
      existingGroups,
    );

    return this.locationGroupRepository.createLocationGroup({
      locationGroupId,
      name,
      centerLatitude,
      centerLongitude,
      radiusMeters: this.userCreatedLocationGroupRadiusMeters,
      shapeType: "polygon",
      polygon: proposedBoundary.polygon,
      currentNoiseLevel: null,
      currentOccupancyLevel: null,
      updatedAt: null,
    });
  }

  async getGroupBoundary(groupId) {
    const group = await this.locationGroupRepository.getLocationGroupById(groupId);
    if (!group) {
      throw new Error(`LocationGroup not found for id ${groupId}`);
    }

    if (group.shapeType === "polygon" && Array.isArray(group.polygon) && group.polygon.length >= 3) {
      const polygon = group.polygon
        .map((vertex) => ({
          latitude: Number(vertex.latitude),
          longitude: Number(vertex.longitude),
        }))
        .filter((vertex) => Number.isFinite(vertex.latitude) && Number.isFinite(vertex.longitude));

      if (polygon.length >= 3) {
        const { vertices: closedPolygon } = isClosedPolygon(polygon);
        return {
          locationGroupId: group.locationGroupId,
          name: group.name,
          shapeType: "polygon",
          polygon: closedPolygon,
        };
      }
    }

    if (
      Number.isFinite(group.centerLatitude) &&
      Number.isFinite(group.centerLongitude) &&
      Number.isFinite(group.radiusMeters)
    ) {
      return {
        locationGroupId: group.locationGroupId,
        name: group.name,
        shapeType: "circle",
        centerLatitude: group.centerLatitude,
        centerLongitude: group.centerLongitude,
        radiusMeters: group.radiusMeters,
      };
    }

    const locations = await this.listLocationsByGroup(groupId);
    if (locations.length === 0) {
      throw new Error(`No study locations are configured for group ${groupId}`);
    }

    const centerLatitude =
      locations.reduce((sum, location) => sum + location.latitude, 0) / locations.length;
    const centerLongitude =
      locations.reduce((sum, location) => sum + location.longitude, 0) / locations.length;

    let maxDistanceMeters = 0;
    for (const location of locations) {
      const distanceMeters = haversineDistanceMeters(
        { latitude: centerLatitude, longitude: centerLongitude },
        { latitude: location.latitude, longitude: location.longitude },
      );
      if (distanceMeters > maxDistanceMeters) {
        maxDistanceMeters = distanceMeters;
      }
    }

    return {
      locationGroupId: group.locationGroupId,
      name: group.name,
      shapeType: "circle",
      centerLatitude,
      centerLongitude,
      radiusMeters: Math.max(
        this.minimumLocationGroupRadiusMeters,
        maxDistanceMeters + this.locationGroupPaddingMeters,
      ),
    };
  }

  async _buildUniqueStudyLocationId(group, name, existingLocations) {
    const baseId = `${normalizeIdComponent(group.name)}-${normalizeIdComponent(name)}`;
    let suffix = 0;
    let nextId = baseId;
    const existingIds = new Set(existingLocations.map((location) => location.studyLocationId));

    while (existingIds.has(nextId)) {
      suffix += 1;
      nextId = `${baseId}-${suffix + 1}`;
    }

    return nextId;
  }

  async _buildUniqueLocationGroupId(name, existingGroups) {
    const baseId = `group-${normalizeIdComponent(name)}`;
    let suffix = 0;
    let nextId = baseId;
    const existingIds = new Set(existingGroups.map((group) => group.locationGroupId));

    while (existingIds.has(nextId)) {
      suffix += 1;
      nextId = `${baseId}-${suffix + 1}`;
    }

    return nextId;
  }

  async _tryGetGroupBoundary(groupId) {
    try {
      return await this.getGroupBoundary(groupId);
    } catch (error) {
      if (
        error &&
        typeof error.message === "string" &&
        error.message.includes("No study locations are configured")
      ) {
        return null;
      }

      throw error;
    }
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

function buildRegularHexagonBoundary({
  centerLatitude,
  centerLongitude,
  apothemMeters,
}) {
  const circumradiusMeters = apothemMeters / Math.cos(Math.PI / 6);
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng =
    metersPerDegreeLat * Math.max(Math.cos(toRadians(centerLatitude)), Number.EPSILON);

  const openVertices = Array.from({ length: 6 }, (_, index) => {
    const angleRadians = toRadians(-90 + (index * 60));
    return {
      latitude:
        centerLatitude +
        (Math.sin(angleRadians) * circumradiusMeters) / metersPerDegreeLat,
      longitude:
        centerLongitude +
        (Math.cos(angleRadians) * circumradiusMeters) / metersPerDegreeLng,
    };
  });

  return isClosedPolygon(openVertices).vertices;
}

function isWithinBoundary(boundary, coords) {
  if (Array.isArray(boundary.polygon) && boundary.polygon.length >= 4) {
    return pointInPolygon(coords, boundary.polygon) || pointOnPolygonBoundary(coords, boundary.polygon);
  }

  if (
    !Number.isFinite(boundary.centerLatitude) ||
    !Number.isFinite(boundary.centerLongitude) ||
    !Number.isFinite(boundary.radiusMeters)
  ) {
    return false;
  }

  return haversineDistanceMeters(
    { latitude: boundary.centerLatitude, longitude: boundary.centerLongitude },
    coords,
  ) <= boundary.radiusMeters;
}

function normalizeIdComponent(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "study-location";
}

module.exports = {
  LocationService,
};
