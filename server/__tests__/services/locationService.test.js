'use strict';

const { LocationService } = require('../../services/locationService');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLocation(overrides = {}) {
  return {
    studyLocationId: 'loc-1',
    locationGroupId: 'grp-1',
    name: 'Study Room A',
    floorLabel: 'Floor 1',
    sublocationLabel: '',
    latitude: 28.6002,
    longitude: -81.2018,
    currentNoiseLevel: null,
    currentOccupancyLevel: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeGroup(overrides = {}) {
  return {
    locationGroupId: 'grp-1',
    name: 'Library',
    centerLatitude: 28.6002,
    centerLongitude: -81.2018,
    radiusMeters: 100,
    currentNoiseLevel: null,
    currentOccupancyLevel: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeRepos(locationOverrides = {}, groupOverrides = {}) {
  const studyLocationRepository = {
    getAllStudyLocations: jest.fn().mockResolvedValue([makeLocation()]),
    getStudyLocationById: jest.fn().mockResolvedValue(makeLocation()),
    updateStudyLocation: jest.fn().mockImplementation((loc) => Promise.resolve(loc)),
    bulkUpdateStudyLocations: jest.fn().mockResolvedValue(undefined),
    ...locationOverrides,
  };

  const locationGroupRepository = {
    getAllLocationGroups: jest.fn().mockResolvedValue([makeGroup()]),
    getLocationGroupById: jest.fn().mockResolvedValue(makeGroup()),
    updateLocationGroup: jest.fn().mockImplementation((g) => Promise.resolve(g)),
    bulkUpdateLocationGroups: jest.fn().mockResolvedValue(undefined),
    ...groupOverrides,
  };

  return { studyLocationRepository, locationGroupRepository };
}

// Use a large maxResolutionDistanceMeters so distance checks don't block basic tests
function makeService(locationOverrides, groupOverrides) {
  const { studyLocationRepository, locationGroupRepository } = makeRepos(
    locationOverrides,
    groupOverrides,
  );
  return new LocationService(studyLocationRepository, locationGroupRepository, Number.POSITIVE_INFINITY);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LocationService', () => {
  // ── getAllGroups ──────────────────────────────────────────────
  describe('getAllGroups', () => {
    it('returns groups sorted alphabetically by name', async () => {
      const groups = [
        makeGroup({ locationGroupId: 'g2', name: 'Zebra Hall' }),
        makeGroup({ locationGroupId: 'g1', name: 'Alpha Hall' }),
      ];
      const service = makeService(
        {},
        { getAllLocationGroups: jest.fn().mockResolvedValue(groups) },
      );

      const result = await service.getAllGroups();
      expect(result[0].name).toBe('Alpha Hall');
      expect(result[1].name).toBe('Zebra Hall');
    });

    it('returns an empty array when there are no groups', async () => {
      const service = makeService({}, { getAllLocationGroups: jest.fn().mockResolvedValue([]) });
      const result = await service.getAllGroups();
      expect(result).toEqual([]);
    });
  });

  // ── listLocationsByGroup ──────────────────────────────────────
  describe('listLocationsByGroup', () => {
    it('filters locations by groupId', async () => {
      const locations = [
        makeLocation({ studyLocationId: 'l1', locationGroupId: 'grp-1', name: 'Room A' }),
        makeLocation({ studyLocationId: 'l2', locationGroupId: 'grp-2', name: 'Room B' }),
      ];
      const service = makeService({ getAllStudyLocations: jest.fn().mockResolvedValue(locations) });
      const result = await service.listLocationsByGroup('grp-1');
      expect(result).toHaveLength(1);
      expect(result[0].studyLocationId).toBe('l1');
    });

    it('returns locations sorted alphabetically by name', async () => {
      const locations = [
        makeLocation({ studyLocationId: 'l2', locationGroupId: 'grp-1', name: 'Zeta Room' }),
        makeLocation({ studyLocationId: 'l1', locationGroupId: 'grp-1', name: 'Alpha Room' }),
      ];
      const service = makeService({ getAllStudyLocations: jest.fn().mockResolvedValue(locations) });
      const result = await service.listLocationsByGroup('grp-1');
      expect(result[0].name).toBe('Alpha Room');
      expect(result[1].name).toBe('Zeta Room');
    });

    it('returns an empty array when no locations belong to that group', async () => {
      const service = makeService({ getAllStudyLocations: jest.fn().mockResolvedValue([]) });
      const result = await service.listLocationsByGroup('no-such-group');
      expect(result).toEqual([]);
    });
  });

  // ── getLocationById ───────────────────────────────────────────
  describe('getLocationById', () => {
    it('returns the location when found', async () => {
      const loc = makeLocation({ studyLocationId: 'found-id' });
      const service = makeService({ getStudyLocationById: jest.fn().mockResolvedValue(loc) });
      const result = await service.getLocationById('found-id');
      expect(result.studyLocationId).toBe('found-id');
    });

    it('throws when the location is not found', async () => {
      const service = makeService({ getStudyLocationById: jest.fn().mockResolvedValue(null) });
      await expect(service.getLocationById('missing')).rejects.toThrow('not found');
    });
  });

  // ── getClosestLocation ────────────────────────────────────────
  describe('getClosestLocation', () => {
    it('throws when there are no study locations configured', async () => {
      const service = makeService({ getAllStudyLocations: jest.fn().mockResolvedValue([]) });
      await expect(
        service.getClosestLocation({ latitude: 28.6, longitude: -81.2 }),
      ).rejects.toThrow('No study locations');
    });

    it('throws when no location is within the max resolution distance', async () => {
      // Use a very tight max distance (1 meter) with a far location
      const { studyLocationRepository, locationGroupRepository } = makeRepos();
      const service = new LocationService(studyLocationRepository, locationGroupRepository, 1);
      await expect(
        service.getClosestLocation({ latitude: 0, longitude: 0 }),
      ).rejects.toThrow('within the allowed resolution distance');
    });

    it('returns the closest location out of multiple options', async () => {
      const near = makeLocation({ studyLocationId: 'near', latitude: 28.6002, longitude: -81.2018 });
      const far = makeLocation({ studyLocationId: 'far', latitude: 28.7, longitude: -81.3 });
      const service = makeService({
        getAllStudyLocations: jest.fn().mockResolvedValue([far, near]),
      });

      const result = await service.getClosestLocation({ latitude: 28.6002, longitude: -81.2018 });
      expect(result.studyLocationId).toBe('near');
    });
  });

  // ── createLocationInGroup ─────────────────────────────────────
  describe('createLocationInGroup', () => {
    it('throws when the group is not found', async () => {
      const service = makeService(
        {},
        { getLocationGroupById: jest.fn().mockResolvedValue(null) },
      );
      await expect(
        service.createLocationInGroup('no-group', { name: 'X', latitude: 0, longitude: 0 }),
      ).rejects.toThrow('not found');
    });

    it('throws when name is missing', async () => {
      const service = makeService();
      await expect(
        service.createLocationInGroup('grp-1', { latitude: 28.6002, longitude: -81.2018 }),
      ).rejects.toThrow('required');
    });

    it('throws when coordinates are invalid', async () => {
      const service = makeService();
      await expect(
        service.createLocationInGroup('grp-1', { name: 'Room', latitude: 'bad', longitude: 'bad' }),
      ).rejects.toThrow('must be valid numbers');
    });

    it('throws when location is outside the group boundary', async () => {
      // Group centered at UCF library, tiny radius
      const group = makeGroup({
        centerLatitude: 28.6002,
        centerLongitude: -81.2018,
        radiusMeters: 10,
      });
      const service = makeService(
        { getAllStudyLocations: jest.fn().mockResolvedValue([]) },
        { getLocationGroupById: jest.fn().mockResolvedValue(group) },
      );
      // Far away coordinates
      await expect(
        service.createLocationInGroup('grp-1', {
          name: 'Room',
          latitude: 28.7000,
          longitude: -81.3000,
        }),
      ).rejects.toThrow('boundary');
    });

    it('creates and returns the new location when input is valid', async () => {
      const group = makeGroup();
      const existingLocations = [];
      const savedLocation = makeLocation({ studyLocationId: 'library-study-room-a' });

      const studyLocationRepository = {
        getAllStudyLocations: jest.fn().mockResolvedValue(existingLocations),
        getStudyLocationById: jest.fn(),
        updateStudyLocation: jest.fn().mockResolvedValue(savedLocation),
        bulkUpdateStudyLocations: jest.fn(),
      };
      const locationGroupRepository = {
        getAllLocationGroups: jest.fn().mockResolvedValue([group]),
        getLocationGroupById: jest.fn().mockResolvedValue(group),
        updateLocationGroup: jest.fn(),
        bulkUpdateLocationGroups: jest.fn(),
      };
      const service = new LocationService(
        studyLocationRepository,
        locationGroupRepository,
        Number.POSITIVE_INFINITY,
      );

      // Coordinates inside the group boundary (center ± small offset)
      const result = await service.createLocationInGroup('grp-1', {
        name: 'Study Room A',
        latitude: 28.6002,
        longitude: -81.2018,
      });

      expect(studyLocationRepository.updateStudyLocation).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  // ── createLocationGroup ───────────────────────────────────────
  describe('createLocationGroup', () => {
    it('throws when name is missing', async () => {
      const service = makeService(
        {},
        { getAllLocationGroups: jest.fn().mockResolvedValue([]) },
      );
      await expect(
        service.createLocationGroup({
          centerLatitude: 28.6,
          centerLongitude: -81.2,
          creatorLatitude: 28.6,
          creatorLongitude: -81.2,
        }),
      ).rejects.toThrow('required');
    });

    it('throws when center coordinates are invalid', async () => {
      const service = makeService(
        {},
        { getAllLocationGroups: jest.fn().mockResolvedValue([]) },
      );
      await expect(
        service.createLocationGroup({
          name: 'New Hall',
          centerLatitude: 'bad',
          centerLongitude: 'bad',
          creatorLatitude: 28.6,
          creatorLongitude: -81.2,
        }),
      ).rejects.toThrow('must be valid numbers');
    });

    it('throws when creator is inside an existing group', async () => {
      // Existing group at exactly the creator's location
      const existingGroup = makeGroup({
        centerLatitude: 28.6002,
        centerLongitude: -81.2018,
        radiusMeters: 1000,
      });
      const service = makeService(
        { getAllStudyLocations: jest.fn().mockResolvedValue([makeLocation()]) },
        { getAllLocationGroups: jest.fn().mockResolvedValue([existingGroup]), getLocationGroupById: jest.fn().mockResolvedValue(existingGroup) },
      );
      await expect(
        service.createLocationGroup({
          name: 'Duplicate Hall',
          centerLatitude: 28.6002,
          centerLongitude: -81.2018,
          creatorLatitude: 28.6002,
          creatorLongitude: -81.2018,
        }),
      ).rejects.toThrow('already inside an existing location group');
    });
  });
});
