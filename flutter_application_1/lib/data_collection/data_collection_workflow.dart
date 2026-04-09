import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import '../config/api_config.dart';
import 'data_collection_model.dart';

enum ReportDeliveryStatus { submittedToApi, queuedOffline }

@immutable
class DataCollectionGroupVertex {
  const DataCollectionGroupVertex({
    required this.latitude,
    required this.longitude,
  });

  final double latitude;
  final double longitude;
}

@immutable
class DataCollectionStudyLocation {
  const DataCollectionStudyLocation({
    required this.studyLocationId,
    required this.locationGroupId,
    required this.locationName,
    required this.buildingName,
    required this.floorLabel,
    required this.sublocationLabel,
    required this.latitude,
    required this.longitude,
    this.groupCenterLatitude,
    this.groupCenterLongitude,
    this.groupRadiusMeters,
    this.groupPolygon = const <DataCollectionGroupVertex>[],
  });

  final String studyLocationId;
  final String locationGroupId;
  final String locationName;
  final String buildingName;
  final String floorLabel;
  final String sublocationLabel;
  final double latitude;
  final double longitude;
  final double? groupCenterLatitude;
  final double? groupCenterLongitude;
  final double? groupRadiusMeters;
  final List<DataCollectionGroupVertex> groupPolygon;

  String get displayLabel => '$buildingName - $locationName';
  String get detailLabel => '$floorLabel, $sublocationLabel';
}

@immutable
class DataCollectionLocationGroup {
  const DataCollectionLocationGroup({
    required this.locationGroupId,
    required this.buildingName,
    required this.centerLatitude,
    required this.centerLongitude,
    required this.radiusMeters,
    required this.studyLocations,
    this.polygon = const <DataCollectionGroupVertex>[],
    this.hasExplicitBoundary = false,
  });

  final String locationGroupId;
  final String buildingName;
  final double centerLatitude;
  final double centerLongitude;
  final double radiusMeters;
  final List<DataCollectionStudyLocation> studyLocations;
  final List<DataCollectionGroupVertex> polygon;
  final bool hasExplicitBoundary;

  bool contains(SessionCoordinates coords) {
    if (polygon.length < 3) {
      return false;
    }

    return _pointInOrOnPolygon(
      latitude: coords.latitude,
      longitude: coords.longitude,
      polygon: polygon,
    );
  }

  DataCollectionStudyLocation resolveNearestLocation(
    SessionCoordinates coords,
  ) {
    var nearestLocation = studyLocations.first;
    var nearestDistanceMeters = double.infinity;

    for (final location in studyLocations) {
      final distanceMeters = _haversineDistanceMeters(
        latitudeA: coords.latitude,
        longitudeA: coords.longitude,
        latitudeB: location.latitude,
        longitudeB: location.longitude,
      );

      if (distanceMeters < nearestDistanceMeters) {
        nearestDistanceMeters = distanceMeters;
        nearestLocation = location;
      }
    }

    return nearestLocation;
  }
}

const List<DataCollectionGroupVertex> _libraryGroupPolygon =
    <DataCollectionGroupVertex>[
      DataCollectionGroupVertex(latitude: 28.60008, longitude: -81.20208),
      DataCollectionGroupVertex(latitude: 28.60056, longitude: -81.20208),
      DataCollectionGroupVertex(latitude: 28.60056, longitude: -81.20136),
      DataCollectionGroupVertex(latitude: 28.60008, longitude: -81.20136),
    ];

const List<DataCollectionGroupVertex> _mathGroupPolygon =
    <DataCollectionGroupVertex>[
      DataCollectionGroupVertex(latitude: 28.60090, longitude: -81.19910),
      DataCollectionGroupVertex(latitude: 28.60134, longitude: -81.19910),
      DataCollectionGroupVertex(latitude: 28.60134, longitude: -81.19858),
      DataCollectionGroupVertex(latitude: 28.60090, longitude: -81.19858),
    ];

const List<DataCollectionGroupVertex> _studentUnionGroupPolygon =
    <DataCollectionGroupVertex>[
      DataCollectionGroupVertex(latitude: 28.60174, longitude: -81.20018),
      DataCollectionGroupVertex(latitude: 28.60210, longitude: -81.20018),
      DataCollectionGroupVertex(latitude: 28.60210, longitude: -81.19970),
      DataCollectionGroupVertex(latitude: 28.60174, longitude: -81.19970),
    ];

const List<DataCollectionStudyLocation> seededStudyLocations = [
  DataCollectionStudyLocation(
    studyLocationId: 'library-floor-1-quiet',
    locationGroupId: 'group-john-c-hitt-library',
    locationName: 'Quiet Study',
    buildingName: 'John C. Hitt Library',
    floorLabel: 'Floor 1',
    sublocationLabel: 'North Reading Room',
    latitude: 28.60024,
    longitude: -81.20182,
    groupPolygon: _libraryGroupPolygon,
  ),
  DataCollectionStudyLocation(
    studyLocationId: 'library-floor-2-moderate',
    locationGroupId: 'group-john-c-hitt-library',
    locationName: 'Collaboration Tables',
    buildingName: 'John C. Hitt Library',
    floorLabel: 'Floor 2',
    sublocationLabel: 'West Commons',
    latitude: 28.60036,
    longitude: -81.20168,
    groupPolygon: _libraryGroupPolygon,
  ),
  DataCollectionStudyLocation(
    studyLocationId: 'library-floor-3-busy',
    locationGroupId: 'group-john-c-hitt-library',
    locationName: 'Open Computer Lab',
    buildingName: 'John C. Hitt Library',
    floorLabel: 'Floor 3',
    sublocationLabel: 'Digital Media Area',
    latitude: 28.60048,
    longitude: -81.20155,
    groupPolygon: _libraryGroupPolygon,
  ),
  DataCollectionStudyLocation(
    studyLocationId: 'library-floor-4-empty',
    locationGroupId: 'group-john-c-hitt-library',
    locationName: 'Silent Study Cubicles',
    buildingName: 'John C. Hitt Library',
    floorLabel: 'Floor 4',
    sublocationLabel: 'East Quiet Wing',
    latitude: 28.60018,
    longitude: -81.20198,
    groupPolygon: _libraryGroupPolygon,
  ),
  DataCollectionStudyLocation(
    studyLocationId: 'msb-floor-2-moderate',
    locationGroupId: 'group-mathematical-sciences-building',
    locationName: 'Study Nook',
    buildingName: 'Mathematical Sciences Building',
    floorLabel: 'Floor 2',
    sublocationLabel: 'Atrium Balcony',
    latitude: 28.60116,
    longitude: -81.19886,
    groupPolygon: _mathGroupPolygon,
  ),
  DataCollectionStudyLocation(
    studyLocationId: 'student-union-food-court',
    locationGroupId: 'group-student-union',
    locationName: 'Food Court Seating',
    buildingName: 'Student Union',
    floorLabel: 'Level 1',
    sublocationLabel: 'South Dining Hall',
    latitude: 28.60192,
    longitude: -81.19994,
    groupPolygon: _studentUnionGroupPolygon,
  ),
];

class LocalStudyLocationResolver {
  const LocalStudyLocationResolver({
    this.studyLocations = seededStudyLocations,
    this.maxResolutionDistanceMeters = 150,
    this.locationGroupPaddingMeters = 45,
    this.minimumLocationGroupRadiusMeters = 40,
  });

  final List<DataCollectionStudyLocation> studyLocations;
  final double maxResolutionDistanceMeters;
  final double locationGroupPaddingMeters;
  final double minimumLocationGroupRadiusMeters;

  DataCollectionStudyLocation? findById(String? studyLocationId) {
    if (studyLocationId == null || studyLocationId.isEmpty) {
      return studyLocations.isEmpty ? null : studyLocations.first;
    }

    for (final location in studyLocations) {
      if (location.studyLocationId == studyLocationId) {
        return location;
      }
    }

    return studyLocations.isEmpty ? null : studyLocations.first;
  }

  DataCollectionStudyLocation? resolveNearest({
    required double latitude,
    required double longitude,
  }) {
    DataCollectionStudyLocation? nearestLocation;
    var nearestDistanceMeters = double.infinity;

    for (final location in studyLocations) {
      final distanceMeters = _haversineDistanceMeters(
        latitudeA: latitude,
        longitudeA: longitude,
        latitudeB: location.latitude,
        longitudeB: location.longitude,
      );

      if (distanceMeters < nearestDistanceMeters) {
        nearestDistanceMeters = distanceMeters;
        nearestLocation = location;
      }
    }

    if (nearestDistanceMeters > maxResolutionDistanceMeters) {
      return null;
    }

    return nearestLocation;
  }

  List<DataCollectionStudyLocation> locationsForGroup(String locationGroupId) {
    return studyLocations
        .where((location) => location.locationGroupId == locationGroupId)
        .toList(growable: false);
  }

  List<DataCollectionLocationGroup> get locationGroups {
    final groupedLocations = <String, List<DataCollectionStudyLocation>>{};

    for (final location in studyLocations) {
      groupedLocations.putIfAbsent(
        location.locationGroupId,
        () => <DataCollectionStudyLocation>[],
      );
      groupedLocations[location.locationGroupId]!.add(location);
    }

    return groupedLocations.entries
        .map((entry) => _buildLocationGroup(entry.key, entry.value))
        .toList(growable: false);
  }

  DataCollectionLocationGroup? findGroupById(String? locationGroupId) {
    if (locationGroupId == null || locationGroupId.isEmpty) {
      return null;
    }

    final groupedLocations = locationsForGroup(locationGroupId);
    if (groupedLocations.isEmpty) {
      return null;
    }

    return _buildLocationGroup(locationGroupId, groupedLocations);
  }

  DataCollectionLocationGroup? resolveNearestGroup({
    required double latitude,
    required double longitude,
  }) {
    final coords = SessionCoordinates(latitude: latitude, longitude: longitude);
    final containingGroups =
        locationGroups
            .where((group) => group.polygon.length >= 3 && group.contains(coords))
            .toList();

    if (containingGroups.isNotEmpty) {
      containingGroups.sort(
        (left, right) => _distanceToGroup(left, coords)
            .compareTo(_distanceToGroup(right, coords)),
      );
      return containingGroups.first;
    }

    return null;
  }

  bool isWithinLocationGroup({
    required String locationGroupId,
    required double latitude,
    required double longitude,
  }) {
    final group = findGroupById(locationGroupId);
    if (group == null) {
      return false;
    }

    return group.contains(
      SessionCoordinates(latitude: latitude, longitude: longitude),
    );
  }

  DataCollectionLocationGroup _buildLocationGroup(
    String locationGroupId,
    List<DataCollectionStudyLocation> groupedLocations,
  ) {
    final explicitPolygon = _firstExplicitPolygon(groupedLocations);
    final explicitCenterLatitude = _firstFiniteValue(
      groupedLocations.map((location) => location.groupCenterLatitude),
    );
    final explicitCenterLongitude = _firstFiniteValue(
      groupedLocations.map((location) => location.groupCenterLongitude),
    );
    final explicitRadiusMeters = _firstFiniteValue(
      groupedLocations.map((location) => location.groupRadiusMeters),
    );

    if (explicitPolygon.length >= 3) {
      final polygonCenter = _polygonAverageCenter(explicitPolygon);
      final centerLatitude = explicitCenterLatitude ?? polygonCenter.latitude;
      final centerLongitude = explicitCenterLongitude ?? polygonCenter.longitude;
      final radiusMeters =
          explicitRadiusMeters ??
          _maxPolygonDistanceMeters(
            centerLatitude: centerLatitude,
            centerLongitude: centerLongitude,
            polygon: explicitPolygon,
          );

      return DataCollectionLocationGroup(
        locationGroupId: locationGroupId,
        buildingName: groupedLocations.first.buildingName,
        centerLatitude: centerLatitude,
        centerLongitude: centerLongitude,
        radiusMeters: math.max(minimumLocationGroupRadiusMeters, radiusMeters),
        studyLocations: List<DataCollectionStudyLocation>.unmodifiable(
          groupedLocations,
        ),
        polygon: List<DataCollectionGroupVertex>.unmodifiable(explicitPolygon),
        hasExplicitBoundary: true,
      );
    }

    if (explicitCenterLatitude != null &&
        explicitCenterLongitude != null &&
        explicitRadiusMeters != null &&
        explicitRadiusMeters > 0) {
      return DataCollectionLocationGroup(
        locationGroupId: locationGroupId,
        buildingName: groupedLocations.first.buildingName,
        centerLatitude: explicitCenterLatitude,
        centerLongitude: explicitCenterLongitude,
        radiusMeters: explicitRadiusMeters,
        studyLocations: List<DataCollectionStudyLocation>.unmodifiable(
          groupedLocations,
        ),
        hasExplicitBoundary: true,
      );
    }

    final centerLatitude =
        groupedLocations
            .map((location) => location.latitude)
            .reduce((a, b) => a + b) /
        groupedLocations.length;
    final centerLongitude =
        groupedLocations
            .map((location) => location.longitude)
            .reduce((a, b) => a + b) /
        groupedLocations.length;

    var maxDistanceMeters = 0.0;
    for (final location in groupedLocations) {
      final distanceMeters = _haversineDistanceMeters(
        latitudeA: centerLatitude,
        longitudeA: centerLongitude,
        latitudeB: location.latitude,
        longitudeB: location.longitude,
      );
      if (distanceMeters > maxDistanceMeters) {
        maxDistanceMeters = distanceMeters;
      }
    }

    return DataCollectionLocationGroup(
      locationGroupId: locationGroupId,
      buildingName: groupedLocations.first.buildingName,
      centerLatitude: centerLatitude,
      centerLongitude: centerLongitude,
      radiusMeters: math.max(
        minimumLocationGroupRadiusMeters,
        maxDistanceMeters + locationGroupPaddingMeters,
      ),
      studyLocations: List<DataCollectionStudyLocation>.unmodifiable(
        groupedLocations,
      ),
    );
  }

  double _distanceToGroup(
    DataCollectionLocationGroup group,
    SessionCoordinates coords,
  ) {
    final nearestLocation = group.resolveNearestLocation(coords);
    return _haversineDistanceMeters(
      latitudeA: coords.latitude,
      longitudeA: coords.longitude,
      latitudeB: nearestLocation.latitude,
      longitudeB: nearestLocation.longitude,
    );
  }
}

List<DataCollectionGroupVertex> _firstExplicitPolygon(
  List<DataCollectionStudyLocation> groupedLocations,
) {
  for (final location in groupedLocations) {
    if (location.groupPolygon.length >= 3) {
      return location.groupPolygon;
    }
  }

  return const <DataCollectionGroupVertex>[];
}

double? _firstFiniteValue(Iterable<double?> values) {
  for (final value in values) {
    if (value != null && value.isFinite) {
      return value;
    }
  }

  return null;
}

SessionCoordinates _polygonAverageCenter(List<DataCollectionGroupVertex> polygon) {
  final latitude =
      polygon.map((vertex) => vertex.latitude).reduce((a, b) => a + b) /
      polygon.length;
  final longitude =
      polygon.map((vertex) => vertex.longitude).reduce((a, b) => a + b) /
      polygon.length;
  return SessionCoordinates(latitude: latitude, longitude: longitude);
}

double _maxPolygonDistanceMeters({
  required double centerLatitude,
  required double centerLongitude,
  required List<DataCollectionGroupVertex> polygon,
}) {
  var maxDistanceMeters = 0.0;

  for (final vertex in polygon) {
    final distanceMeters = _haversineDistanceMeters(
      latitudeA: centerLatitude,
      longitudeA: centerLongitude,
      latitudeB: vertex.latitude,
      longitudeB: vertex.longitude,
    );
    if (distanceMeters > maxDistanceMeters) {
      maxDistanceMeters = distanceMeters;
    }
  }

  return maxDistanceMeters;
}

bool _pointInOrOnPolygon({
  required double latitude,
  required double longitude,
  required List<DataCollectionGroupVertex> polygon,
}) {
  return _pointOnPolygonBoundary(
        latitude: latitude,
        longitude: longitude,
        polygon: polygon,
      ) ||
      _pointInPolygon(
        latitude: latitude,
        longitude: longitude,
        polygon: polygon,
      );
}

bool _pointInPolygon({
  required double latitude,
  required double longitude,
  required List<DataCollectionGroupVertex> polygon,
}) {
  final ring = _closePolygon(polygon);
  if (ring.length < 4) {
    return false;
  }

  var inside = false;
  final edgeCount = ring.length - 1;

  for (var i = 0, j = edgeCount - 1; i < edgeCount; j = i, i += 1) {
    final xi = ring[i].latitude;
    final yi = ring[i].longitude;
    final xj = ring[j].latitude;
    final yj = ring[j].longitude;

    final intersects =
        (yi > longitude) != (yj > longitude) &&
        latitude < ((xj - xi) * (longitude - yi)) / (yj - yi) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

bool _pointOnPolygonBoundary({
  required double latitude,
  required double longitude,
  required List<DataCollectionGroupVertex> polygon,
}) {
  final ring = _closePolygon(polygon);
  if (ring.length < 4) {
    return false;
  }

  for (var index = 0; index < ring.length - 1; index += 1) {
    final start = ring[index];
    final end = ring[index + 1];
    if (_orientation(start, latitude, longitude, end) == 0 &&
        _pointOnSegment(start, latitude, longitude, end)) {
      return true;
    }
  }

  return false;
}

List<DataCollectionGroupVertex> _closePolygon(
  List<DataCollectionGroupVertex> polygon,
) {
  if (polygon.isEmpty) {
    return const <DataCollectionGroupVertex>[];
  }

  final first = polygon.first;
  final last = polygon.last;
  if (_pointsEqual(first, last)) {
    return List<DataCollectionGroupVertex>.from(polygon);
  }

  return <DataCollectionGroupVertex>[
    ...polygon,
    DataCollectionGroupVertex(
      latitude: first.latitude,
      longitude: first.longitude,
    ),
  ];
}

bool _pointsEqual(
  DataCollectionGroupVertex left,
  DataCollectionGroupVertex right, {
  double epsilon = 1e-9,
}) {
  return (left.latitude - right.latitude).abs() <= epsilon &&
      (left.longitude - right.longitude).abs() <= epsilon;
}

int _orientation(
  DataCollectionGroupVertex start,
  double latitude,
  double longitude,
  DataCollectionGroupVertex end,
) {
  const epsilon = 1e-9;
  final value =
      (longitude - start.longitude) * (end.latitude - latitude) -
      (latitude - start.latitude) * (end.longitude - longitude);

  if (value.abs() < epsilon) {
    return 0;
  }

  return value > 0 ? 1 : 2;
}

bool _pointOnSegment(
  DataCollectionGroupVertex start,
  double latitude,
  double longitude,
  DataCollectionGroupVertex end,
) {
  const epsilon = 1e-9;
  return latitude <= math.max(start.latitude, end.latitude) + epsilon &&
      latitude >= math.min(start.latitude, end.latitude) - epsilon &&
      longitude <= math.max(start.longitude, end.longitude) + epsilon &&
      longitude >= math.min(start.longitude, end.longitude) - epsilon;
}

class CaptureNoiseSummaryConfig {
  const CaptureNoiseSummaryConfig({
    this.minimumSampleCount = 10,
    this.smoothingWindowSize = 5,
    this.winsorizeLowerQuantile = 0.05,
    this.winsorizeUpperQuantile = 0.95,
  });

  final int minimumSampleCount;
  final int smoothingWindowSize;
  final double winsorizeLowerQuantile;
  final double winsorizeUpperQuantile;
}

class CaptureNoiseSummary {
  const CaptureNoiseSummary({
    required this.sampleCount,
    required this.avgNoise,
    required this.maxNoise,
    required this.variance,
    required this.processedSamples,
  });

  final int sampleCount;
  final double avgNoise;
  final double maxNoise;
  final double variance;
  final List<double> processedSamples;
}

class CaptureNoiseSummaryService {
  const CaptureNoiseSummaryService({
    this.config = const CaptureNoiseSummaryConfig(),
  });

  final CaptureNoiseSummaryConfig config;

  CaptureNoiseSummary summarize(List<double> rawSamples) {
    final sanitizedSamples = rawSamples
        .where((sample) => sample.isFinite && sample >= 0)
        .toList(growable: false);

    if (sanitizedSamples.length < config.minimumSampleCount) {
      throw StateError(
        'At least ${config.minimumSampleCount} valid noise samples are required before saving a report draft.',
      );
    }

    final smoothedSamples = _movingAverageSmooth(
      sanitizedSamples,
      config.smoothingWindowSize,
    );
    final processedSamples = _winsorizeSamples(
      smoothedSamples,
      config.winsorizeLowerQuantile,
      config.winsorizeUpperQuantile,
    );

    return CaptureNoiseSummary(
      sampleCount: processedSamples.length,
      avgNoise: _mean(processedSamples),
      maxNoise: processedSamples.reduce(math.max),
      variance: _variance(processedSamples),
      processedSamples: List<double>.unmodifiable(processedSamples),
    );
  }
}

@immutable
class SessionState {
  SessionState({
    required this.userId,
    required this.studyLocationId,
    required this.startedAt,
    this.deviceId,
    this.lastSampleTime,
    this.occupancyLevel,
    List<double> noiseWindow = const <double>[],
  }) : noiseWindow = List<double>.unmodifiable(noiseWindow);

  factory SessionState.start({
    required String userId,
    required String studyLocationId,
    String? deviceId,
    DateTime? startedAt,
  }) {
    return SessionState(
      userId: userId,
      studyLocationId: studyLocationId,
      deviceId: deviceId,
      startedAt: startedAt ?? DateTime.now(),
    );
  }

  final String userId;
  final String studyLocationId;
  final String? deviceId;
  final DateTime startedAt;
  final DateTime? lastSampleTime;
  final OccupancyLevel? occupancyLevel;
  final List<double> noiseWindow;

  int get sampleCount => noiseWindow.length;

  bool get hasOccupancyLevel => occupancyLevel != null;

  int? get occupancyReportValue => occupancyLevel?.reportValue;

  Duration get elapsed => (lastSampleTime ?? startedAt).difference(startedAt);

  SessionState copyWith({
    String? userId,
    String? studyLocationId,
    String? deviceId,
    DateTime? startedAt,
    DateTime? lastSampleTime,
    OccupancyLevel? occupancyLevel,
    List<double>? noiseWindow,
    bool clearDeviceId = false,
    bool clearLastSampleTime = false,
    bool clearOccupancyLevel = false,
  }) {
    return SessionState(
      userId: userId ?? this.userId,
      studyLocationId: studyLocationId ?? this.studyLocationId,
      deviceId: clearDeviceId ? null : (deviceId ?? this.deviceId),
      startedAt: startedAt ?? this.startedAt,
      lastSampleTime: clearLastSampleTime
          ? null
          : (lastSampleTime ?? this.lastSampleTime),
      occupancyLevel: clearOccupancyLevel
          ? null
          : (occupancyLevel ?? this.occupancyLevel),
      noiseWindow: noiseWindow ?? this.noiseWindow,
    );
  }

  SessionState addNoiseReading(double reading, {DateTime? sampledAt}) {
    if (!reading.isFinite || reading < 0) {
      throw StateError('Decibel reading must be a non-negative finite number.');
    }

    return copyWith(
      lastSampleTime: sampledAt ?? DateTime.now(),
      noiseWindow: <double>[...noiseWindow, reading],
    );
  }

  SessionState updateOccupancy(OccupancyLevel level, {DateTime? timestamp}) {
    return copyWith(
      occupancyLevel: level,
      lastSampleTime: timestamp ?? lastSampleTime,
    );
  }

  SessionState resetWindowVariables() {
    return copyWith(noiseWindow: const <double>[]);
  }
}

@immutable
class SessionCoordinates {
  const SessionCoordinates({required this.latitude, required this.longitude});

  final double latitude;
  final double longitude;
}

@immutable
class SessionUser {
  const SessionUser({required this.userId, this.displayName});

  final String userId;
  final String? displayName;
}

abstract class SessionUserRepository {
  Future<SessionUser?> findUserById(String userId);
}

class InMemorySessionUserRepository implements SessionUserRepository {
  const InMemorySessionUserRepository({this.users = const <SessionUser>[]});

  final List<SessionUser> users;

  @override
  Future<SessionUser?> findUserById(String userId) async {
    for (final user in users) {
      if (user.userId == userId) {
        return user;
      }
    }

    return null;
  }
}

class SessionService {
  SessionService({
    this.locationResolver = const LocalStudyLocationResolver(),
    this.userRepository = const InMemorySessionUserRepository(),
    this.summaryService = const CaptureNoiseSummaryService(),
  });

  final LocalStudyLocationResolver locationResolver;
  final SessionUserRepository userRepository;
  final CaptureNoiseSummaryService summaryService;

  SessionState? _sessionState;
  DataCollectionStudyLocation? _resolvedStudyLocation;
  SessionUser? _currentUser;

  SessionState? get sessionState => _sessionState;

  DataCollectionStudyLocation? get activeStudyLocation =>
      _resolvedStudyLocation;

  SessionUser? get currentUser => _currentUser;

  Future<SessionState> initializeSession(
    String userId,
    SessionCoordinates coords, [
    String? deviceId,
  ]) async {
    final studyLocation = resolveStudyLocation(coords);
    await loadUserContext(userId);

    _sessionState = SessionState.start(
      userId: userId,
      studyLocationId: studyLocation.studyLocationId,
      deviceId: deviceId,
    );
    return _sessionState!;
  }

  DataCollectionStudyLocation resolveStudyLocation(SessionCoordinates coords) {
    final studyLocation = locationResolver.resolveNearest(
      latitude: coords.latitude,
      longitude: coords.longitude,
    );

    if (studyLocation == null) {
      throw StateError(
        'No study location found within the allowed resolution distance.',
      );
    }

    _resolvedStudyLocation = studyLocation;
    return studyLocation;
  }

  Future<SessionUser> loadUserContext(String userId) async {
    final normalizedUserId = userId.trim();
    if (normalizedUserId.isEmpty) {
      throw StateError('User id is required to initialize a session.');
    }

    final user =
        await userRepository.findUserById(normalizedUserId) ??
        SessionUser(userId: normalizedUserId);

    _currentUser = user;
    return user;
  }

  void getDecibelReading(double reading, {DateTime? timestamp}) {
    final sessionState = _requireSessionState();
    _sessionState = sessionState.addNoiseReading(reading, sampledAt: timestamp);
  }

  void updateOccupancy(OccupancyLevel level, [DateTime? timestamp]) {
    final sessionState = _requireSessionState();
    _sessionState = sessionState.updateOccupancy(level, timestamp: timestamp);
  }

  CapturedReportDraft buildReport({DateTime? createdAt}) {
    final sessionState = _requireSessionState();
    final occupancyLevel = sessionState.occupancyLevel;
    if (occupancyLevel == null) {
      throw StateError('Cannot build report without an occupancy level.');
    }

    final studyLocation =
        _resolvedStudyLocation ??
        locationResolver.findById(sessionState.studyLocationId);
    if (studyLocation == null) {
      throw StateError(
        'Session study location could not be resolved for report generation.',
      );
    }

    final builder = CapturedReportDraftBuilder(
      summaryService: summaryService,
      userId: sessionState.userId,
    );

    return builder.build(
      location: studyLocation,
      occupancy: occupancyLevel,
      rawSamples: sessionState.noiseWindow,
      createdAt: createdAt,
    );
  }

  void resetWindowVariables() {
    final sessionState = _requireSessionState();
    _sessionState = sessionState.resetWindowVariables();
  }

  void advanceWindow() {
    resetWindowVariables();
  }

  SessionState _requireSessionState() {
    final sessionState = _sessionState;
    if (sessionState == null) {
      throw StateError(
        'Initialize a session before reading decibels or building a report.',
      );
    }

    return sessionState;
  }
}

@immutable
class CapturedReportDraft {
  const CapturedReportDraft({
    required this.reportId,
    required this.userId,
    required this.studyLocationId,
    required this.studyLocationName,
    required this.locationGroupId,
    required this.createdAt,
    required this.avgNoise,
    required this.maxNoise,
    required this.variance,
    required this.occupancy,
    required this.sampleCount,
    this.deliveryStatus = ReportDeliveryStatus.submittedToApi,
    this.deliveryDetail,
  });

  final String reportId;
  final String userId;
  final String studyLocationId;
  final String studyLocationName;
  final String locationGroupId;
  final DateTime createdAt;
  final double avgNoise;
  final double maxNoise;
  final double variance;
  final int occupancy;
  final int sampleCount;
  final ReportDeliveryStatus deliveryStatus;
  final String? deliveryDetail;

  bool get isQueuedOffline =>
      deliveryStatus == ReportDeliveryStatus.queuedOffline;

  CapturedReportDraft copyWith({
    String? reportId,
    String? userId,
    String? studyLocationId,
    String? studyLocationName,
    String? locationGroupId,
    DateTime? createdAt,
    double? avgNoise,
    double? maxNoise,
    double? variance,
    int? occupancy,
    int? sampleCount,
    ReportDeliveryStatus? deliveryStatus,
    String? deliveryDetail,
  }) {
    return CapturedReportDraft(
      reportId: reportId ?? this.reportId,
      userId: userId ?? this.userId,
      studyLocationId: studyLocationId ?? this.studyLocationId,
      studyLocationName: studyLocationName ?? this.studyLocationName,
      locationGroupId: locationGroupId ?? this.locationGroupId,
      createdAt: createdAt ?? this.createdAt,
      avgNoise: avgNoise ?? this.avgNoise,
      maxNoise: maxNoise ?? this.maxNoise,
      variance: variance ?? this.variance,
      occupancy: occupancy ?? this.occupancy,
      sampleCount: sampleCount ?? this.sampleCount,
      deliveryStatus: deliveryStatus ?? this.deliveryStatus,
      deliveryDetail: deliveryDetail ?? this.deliveryDetail,
    );
  }
}

class CapturedReportDraftBuilder {
  const CapturedReportDraftBuilder({
    this.summaryService = const CaptureNoiseSummaryService(),
    this.userId = 'local-user',
  });

  final CaptureNoiseSummaryService summaryService;
  final String userId;

  CapturedReportDraft build({
    required DataCollectionStudyLocation location,
    required OccupancyLevel occupancy,
    required List<double> rawSamples,
    DateTime? createdAt,
  }) {
    final timestamp = createdAt ?? DateTime.now();
    final summary = summaryService.summarize(rawSamples);

    return CapturedReportDraft(
      reportId: _buildDraftId(location.studyLocationId, timestamp),
      userId: userId,
      studyLocationId: location.studyLocationId,
      studyLocationName: location.displayLabel,
      locationGroupId: location.locationGroupId,
      createdAt: timestamp,
      avgNoise: summary.avgNoise,
      maxNoise: summary.maxNoise,
      variance: summary.variance,
      occupancy: occupancy.reportValue,
      sampleCount: summary.sampleCount,
    );
  }

  String _buildDraftId(String studyLocationId, DateTime timestamp) {
    final normalizedLocation = studyLocationId.replaceAll(
      RegExp(r'[^a-zA-Z0-9]+'),
      '-',
    );
    return 'draft-$normalizedLocation-${timestamp.millisecondsSinceEpoch}';
  }
}

class DataCollectionApiConfig {
  const DataCollectionApiConfig({
    this.baseUrl,
    this.authToken = const String.fromEnvironment('DATA_COLLECTION_AUTH_TOKEN'),
    this.defaultUserId = const String.fromEnvironment(
      'DATA_COLLECTION_USER_ID',
      defaultValue: 'local-user',
    ),
    this.authTokenProvider,
    this.userIdProvider,
  });

  final String? baseUrl;
  final String authToken;
  final String defaultUserId;
  final String Function()? authTokenProvider;
  final String Function()? userIdProvider;

  String get resolvedAuthToken {
    if (authTokenProvider != null) {
      final token = authTokenProvider!();
      if (token.trim().isNotEmpty) return token.trim();
    }
    return authToken.trim();
  }

  String get resolvedUserId {
    if (userIdProvider != null) {
      final id = userIdProvider!();
      if (id.trim().isNotEmpty) return id.trim();
    }
    return defaultUserId;
  }

  String get resolvedBaseUrl {
    if (baseUrl != null && baseUrl!.trim().isNotEmpty) {
      return baseUrl!.trim();
    }

    return apiBaseUrl();
  }
}

abstract class ReportDraftRepository {
  Future<CapturedReportDraft> saveDraft(CapturedReportDraft draft);

  Future<void> removeDraft(String reportId);

  List<CapturedReportDraft> get drafts;

  int get pendingDraftCount;
}

class ApiReportDraftRepository implements ReportDraftRepository {
  ApiReportDraftRepository({
    this.apiConfig = const DataCollectionApiConfig(),
    this.onUnauthorized,
  });

  final DataCollectionApiConfig apiConfig;
  final VoidCallback? onUnauthorized;
  final List<CapturedReportDraft> _drafts = <CapturedReportDraft>[];

  @override
  List<CapturedReportDraft> get drafts =>
      List<CapturedReportDraft>.unmodifiable(_drafts);

  @override
  int get pendingDraftCount => 0;

  @override
  Future<CapturedReportDraft> saveDraft(CapturedReportDraft draft) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 8);

    try {
      final request = await client
          .postUrl(Uri.parse('${apiConfig.resolvedBaseUrl}/api/reports'))
          .timeout(const Duration(seconds: 8));
      request.headers.contentType = ContentType.json;
      if (apiConfig.resolvedAuthToken.isNotEmpty) {
        request.headers.set(
          HttpHeaders.authorizationHeader,
          'Bearer ${apiConfig.resolvedAuthToken}',
        );
      }

      request.write(
        jsonEncode({
          'userId': draft.userId.isEmpty
              ? apiConfig.resolvedUserId
              : draft.userId,
          'studyLocationId': draft.studyLocationId,
          'createdAt': draft.createdAt.toIso8601String(),
          'avgNoise': draft.avgNoise,
          'maxNoise': draft.maxNoise,
          'variance': draft.variance,
          'occupancy': draft.occupancy,
        }),
      );

      final response = await request.close().timeout(
        const Duration(seconds: 8),
      );
      final body = await response
          .transform(utf8.decoder)
          .join()
          .timeout(const Duration(seconds: 8));
      final payload = body.isEmpty
          ? const <String, dynamic>{}
          : jsonDecode(body) as Map<String, dynamic>;

      if (response.statusCode == 401) {
        onUnauthorized?.call();
        throw StateError('Session expired. Please log in again.');
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        final message =
            (payload['error'] as String?) ??
            (payload['details'] as String?) ??
            'Report submission failed with status ${response.statusCode}.';
        throw StateError(message);
      }

      final reportJson = Map<String, dynamic>.from(
        (payload['report'] as Map<String, dynamic>?) ?? payload,
      );
      final savedDraft = draft.copyWith(
        reportId: reportJson['reportId'] as String? ?? draft.reportId,
        userId: reportJson['userId'] as String? ?? draft.userId,
        studyLocationId:
            reportJson['studyLocationId'] as String? ?? draft.studyLocationId,
        createdAt:
            DateTime.tryParse(reportJson['createdAt'] as String? ?? '') ??
            draft.createdAt,
        avgNoise:
            (reportJson['avgNoise'] as num?)?.toDouble() ?? draft.avgNoise,
        maxNoise:
            (reportJson['maxNoise'] as num?)?.toDouble() ?? draft.maxNoise,
        variance:
            (reportJson['variance'] as num?)?.toDouble() ?? draft.variance,
        occupancy:
            (reportJson['occupancy'] as num?)?.toInt() ?? draft.occupancy,
        deliveryStatus: ReportDeliveryStatus.submittedToApi,
        deliveryDetail: 'Submitted to ${apiConfig.resolvedBaseUrl}/api/reports',
      );

      _drafts.insert(0, savedDraft);
      return savedDraft;
    } on SocketException {
      throw StateError(
        'Unable to reach the report API at ${apiConfig.resolvedBaseUrl}. Start the server and try again.',
      );
    } on HttpException catch (error) {
      throw StateError(error.message);
    } finally {
      client.close(force: true);
    }
  }

  @override
  Future<void> removeDraft(String reportId) async {
    _drafts.removeWhere((draft) => draft.reportId == reportId);
  }
}

class InMemoryReportDraftRepository implements ReportDraftRepository {
  InMemoryReportDraftRepository._();

  static final InMemoryReportDraftRepository instance =
      InMemoryReportDraftRepository._();

  final List<CapturedReportDraft> _drafts = <CapturedReportDraft>[];

  @override
  List<CapturedReportDraft> get drafts =>
      List<CapturedReportDraft>.unmodifiable(_drafts);

  @override
  int get pendingDraftCount => _drafts.length;

  @override
  Future<CapturedReportDraft> saveDraft(CapturedReportDraft draft) async {
    _drafts.removeWhere((existing) => existing.reportId == draft.reportId);
    final queuedDraft = draft.copyWith(
      deliveryStatus: ReportDeliveryStatus.queuedOffline,
    );
    _drafts.insert(0, queuedDraft);
    return queuedDraft;
  }

  @override
  Future<void> removeDraft(String reportId) async {
    _drafts.removeWhere((draft) => draft.reportId == reportId);
  }

  @visibleForTesting
  void clear() {
    _drafts.clear();
  }
}

class FallbackReportDraftRepository implements ReportDraftRepository {
  FallbackReportDraftRepository({
    ReportDraftRepository? primaryRepository,
    ReportDraftRepository? offlineRepository,
  }) : _primaryRepository = primaryRepository ?? ApiReportDraftRepository(),
       _offlineRepository =
           offlineRepository ?? InMemoryReportDraftRepository.instance;

  final ReportDraftRepository _primaryRepository;
  final ReportDraftRepository _offlineRepository;

  @override
  List<CapturedReportDraft> get drafts =>
      List<CapturedReportDraft>.unmodifiable([
        ..._offlineRepository.drafts,
        ..._primaryRepository.drafts,
      ]);

  @override
  int get pendingDraftCount => _offlineRepository.pendingDraftCount;

  @override
  Future<CapturedReportDraft> saveDraft(CapturedReportDraft draft) async {
    try {
      return await _primaryRepository.saveDraft(draft);
    } on StateError catch (error) {
      return _offlineRepository.saveDraft(
        draft.copyWith(deliveryDetail: error.message),
      );
    }
  }

  @override
  Future<void> removeDraft(String reportId) async {
    await Future.wait(<Future<void>>[
      _offlineRepository.removeDraft(reportId),
      _primaryRepository.removeDraft(reportId),
    ]);
  }
}

List<double> _movingAverageSmooth(List<double> samples, int windowSize) {
  if (windowSize <= 1) {
    return List<double>.from(samples);
  }

  final smoothed = <double>[];

  for (var index = 0; index < samples.length; index += 1) {
    final startIndex = math.max(0, index - windowSize + 1);
    final window = samples.sublist(startIndex, index + 1);
    smoothed.add(_mean(window));
  }

  return smoothed;
}

List<double> _winsorizeSamples(
  List<double> samples,
  double lowerQuantile,
  double upperQuantile,
) {
  if (samples.isEmpty) {
    return const [];
  }

  if (lowerQuantile < 0 ||
      upperQuantile > 1 ||
      lowerQuantile >= upperQuantile) {
    throw StateError(
      'Winsorize quantiles must satisfy 0 <= lower < upper <= 1.',
    );
  }

  final sortedSamples = [...samples]..sort();
  final lowerBound = _quantile(sortedSamples, lowerQuantile);
  final upperBound = _quantile(sortedSamples, upperQuantile);

  return samples
      .map((sample) => sample.clamp(lowerBound, upperBound).toDouble())
      .toList(growable: false);
}

double _quantile(List<double> sortedSamples, double q) {
  if (sortedSamples.length == 1) {
    return sortedSamples.first;
  }

  final position = (sortedSamples.length - 1) * q;
  final lowerIndex = position.floor();
  final upperIndex = position.ceil();
  final interpolationWeight = position - lowerIndex;

  if (lowerIndex == upperIndex) {
    return sortedSamples[lowerIndex];
  }

  return (sortedSamples[lowerIndex] * (1 - interpolationWeight)) +
      (sortedSamples[upperIndex] * interpolationWeight);
}

double _mean(List<double> values) {
  if (values.isEmpty) {
    throw StateError('Cannot compute mean of an empty list.');
  }

  return values.reduce((sum, value) => sum + value) / values.length;
}

double _variance(List<double> values) {
  if (values.isEmpty) {
    throw StateError('Cannot compute variance of an empty list.');
  }

  final average = _mean(values);
  final squaredDeviationSum = values.fold<double>(
    0,
    (sum, value) => sum + math.pow(value - average, 2).toDouble(),
  );

  return squaredDeviationSum / values.length;
}

double _haversineDistanceMeters({
  required double latitudeA,
  required double longitudeA,
  required double latitudeB,
  required double longitudeB,
}) {
  const earthRadiusMeters = 6371000.0;
  final latitudeDeltaRadians = _toRadians(latitudeB - latitudeA);
  final longitudeDeltaRadians = _toRadians(longitudeB - longitudeA);
  final aLatitudeRadians = _toRadians(latitudeA);
  final bLatitudeRadians = _toRadians(latitudeB);

  final haversineComponent =
      math.sin(latitudeDeltaRadians / 2) * math.sin(latitudeDeltaRadians / 2) +
      math.cos(aLatitudeRadians) *
          math.cos(bLatitudeRadians) *
          math.sin(longitudeDeltaRadians / 2) *
          math.sin(longitudeDeltaRadians / 2);

  final angularDistance =
      2 *
      math.atan2(
        math.sqrt(haversineComponent),
        math.sqrt(1 - haversineComponent),
      );

  return earthRadiusMeters * angularDistance;
}

double _toRadians(double degrees) => degrees * math.pi / 180;
