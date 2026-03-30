import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import 'data_collection_model.dart';

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
  });

  final String studyLocationId;
  final String locationGroupId;
  final String locationName;
  final String buildingName;
  final String floorLabel;
  final String sublocationLabel;
  final double latitude;
  final double longitude;

  String get displayLabel => '$buildingName - $locationName';
  String get detailLabel => '$floorLabel, $sublocationLabel';
}

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
  ),
];

class LocalStudyLocationResolver {
  const LocalStudyLocationResolver({
    this.studyLocations = seededStudyLocations,
    this.maxResolutionDistanceMeters = 150,
  });

  final List<DataCollectionStudyLocation> studyLocations;
  final double maxResolutionDistanceMeters;

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
    final normalizedLocation = studyLocationId.replaceAll(RegExp(r'[^a-zA-Z0-9]+'), '-');
    return 'draft-$normalizedLocation-${timestamp.millisecondsSinceEpoch}';
  }
}

abstract class ReportDraftRepository {
  Future<CapturedReportDraft> saveDraft(CapturedReportDraft draft);

  List<CapturedReportDraft> get drafts;
}

class InMemoryReportDraftRepository implements ReportDraftRepository {
  InMemoryReportDraftRepository._();

  static final InMemoryReportDraftRepository instance =
      InMemoryReportDraftRepository._();

  final List<CapturedReportDraft> _drafts = <CapturedReportDraft>[];

  @override
  List<CapturedReportDraft> get drafts => List<CapturedReportDraft>.unmodifiable(_drafts);

  @override
  Future<CapturedReportDraft> saveDraft(CapturedReportDraft draft) async {
    _drafts.insert(0, draft);
    return draft;
  }

  @visibleForTesting
  void clear() {
    _drafts.clear();
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

  final angularDistance = 2 *
      math.atan2(
        math.sqrt(haversineComponent),
        math.sqrt(1 - haversineComponent),
      );

  return earthRadiusMeters * angularDistance;
}

double _toRadians(double degrees) => degrees * math.pi / 180;
