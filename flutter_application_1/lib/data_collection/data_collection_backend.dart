import 'dart:convert';
import 'dart:io';

import '../config/api_config.dart';
import 'data_collection_workflow.dart';

abstract class DataCollectionBackendClient {
  Future<void> submitReport(CapturedReportDraft draft);

  Future<List<DataCollectionStudyLocation>> fetchStudyLocations();

  Future<DataCollectionLocationGroup> createLocationGroup({
    required String name,
    required double centerLatitude,
    required double centerLongitude,
    required double creatorLatitude,
    required double creatorLongitude,
  });

  Future<DataCollectionStudyLocation> createStudyLocation({
    required String locationGroupId,
    required String name,
    String floorLabel = '',
    String sublocationLabel = '',
    required double latitude,
    required double longitude,
  });
}

class HttpDataCollectionBackendClient implements DataCollectionBackendClient {
  HttpDataCollectionBackendClient({
    String? baseUrl,
  }) : _baseUrl = (baseUrl ?? apiBaseUrl()).trim();

  final String _baseUrl;

  @override
  Future<List<DataCollectionStudyLocation>> fetchStudyLocations() async {
    final groupsPayload = await _getJsonList('/api/locations/groups');
    final studyLocations = <DataCollectionStudyLocation>[];

    for (final groupEntry in groupsPayload) {
      final group = Map<String, dynamic>.from(groupEntry as Map);
      final groupId = (group['locationGroupId'] as String? ?? '').trim();
      final groupName = (group['name'] as String? ?? 'Unknown Building').trim();
      final groupCenterLatitude = _readFiniteDouble(group['centerLatitude']);
      final groupCenterLongitude = _readFiniteDouble(group['centerLongitude']);
      final groupRadiusMeters = _readFiniteDouble(group['radiusMeters']);
      final groupPolygon = _parseGroupPolygon(group['polygon']);
      if (groupId.isEmpty) {
        continue;
      }

      final locationsPayload = await _getJsonList(
        '/api/locations/groups/${Uri.encodeComponent(groupId)}/locations',
      );

      for (final locationEntry in locationsPayload) {
        final location = Map<String, dynamic>.from(locationEntry as Map);
        final studyLocationId =
            (location['studyLocationId'] as String? ?? '').trim();
        if (studyLocationId.isEmpty) {
          continue;
        }

        studyLocations.add(
          _parseStudyLocation(
            location,
            groupId: groupId,
            groupName: groupName,
            groupCenterLatitude: groupCenterLatitude,
            groupCenterLongitude: groupCenterLongitude,
            groupRadiusMeters: groupRadiusMeters,
            groupPolygon: groupPolygon,
          ),
        );
      }
    }

    if (studyLocations.isEmpty) {
      throw HttpException('No study locations returned by backend.');
    }

    return studyLocations;
  }

  @override
  Future<void> submitReport(CapturedReportDraft draft) async {
    final response = await _sendJson(
      method: 'POST',
      path: '/api/reports',
      body: <String, dynamic>{
        'userId': draft.userId,
        'studyLocationId': draft.studyLocationId,
        'studyLocationName': draft.studyLocationName,
        'locationGroupId': draft.locationGroupId,
        'latitude': draft.latitude,
        'longitude': draft.longitude,
        'createdAt': draft.createdAt.toUtc().toIso8601String(),
        'avgNoise': draft.avgNoise,
        'maxNoise': draft.maxNoise,
        'variance': draft.variance,
        'occupancy': draft.occupancy,
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final payload = await _decodeJson(response);
      final message =
          (payload['error'] as String? ?? 'Report submission failed.').trim();
      throw HttpException(message);
    }
  }

  @override
  Future<DataCollectionStudyLocation> createStudyLocation({
    required String locationGroupId,
    required String name,
    String floorLabel = '',
    String sublocationLabel = '',
    required double latitude,
    required double longitude,
  }) async {
    final response = await _sendJson(
      method: 'POST',
      path: '/api/locations/groups/${Uri.encodeComponent(locationGroupId)}/locations',
      body: <String, dynamic>{
        'name': name,
        'floorLabel': floorLabel,
        'sublocationLabel': sublocationLabel,
        'latitude': latitude,
        'longitude': longitude,
      },
    );

    final payload = await _decodeJson(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message = (payload['error'] as String? ?? 'Study location creation failed.').trim();
      throw HttpException(message);
    }

    final location = Map<String, dynamic>.from(payload as Map);
    final groupResponse = await _send(
      path: '/api/locations/groups',
      method: 'GET',
    );
    if (groupResponse.statusCode < 200 || groupResponse.statusCode >= 300) {
      throw HttpException('Unable to refresh location groups after creating a study location.');
    }

    final groupsPayload = await _decodeJson(groupResponse);
    final matchingGroup = (groupsPayload as List<dynamic>)
        .cast<Map<dynamic, dynamic>>()
        .map((entry) => Map<String, dynamic>.from(entry))
        .firstWhere(
          (entry) => (entry['locationGroupId'] as String? ?? '').trim() == locationGroupId,
          orElse: () => <String, dynamic>{'name': 'Study Location Group'},
        );

    return _parseStudyLocation(
      location,
      groupId: locationGroupId,
      groupName: (matchingGroup['name'] as String? ?? 'Study Location Group').trim(),
      groupCenterLatitude: _readFiniteDouble(matchingGroup['centerLatitude']),
      groupCenterLongitude: _readFiniteDouble(matchingGroup['centerLongitude']),
      groupRadiusMeters: _readFiniteDouble(matchingGroup['radiusMeters']),
      groupPolygon: _parseGroupPolygon(matchingGroup['polygon']),
    );
  }

  @override
  Future<DataCollectionLocationGroup> createLocationGroup({
    required String name,
    required double centerLatitude,
    required double centerLongitude,
    required double creatorLatitude,
    required double creatorLongitude,
  }) async {
    final response = await _sendJson(
      method: 'POST',
      path: '/api/locations/groups',
      body: <String, dynamic>{
        'name': name,
        'centerLatitude': centerLatitude,
        'centerLongitude': centerLongitude,
        'creatorLatitude': creatorLatitude,
        'creatorLongitude': creatorLongitude,
      },
    );

    final payload = await _decodeJson(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message =
          (payload['error'] as String? ?? 'Location group creation failed.')
              .trim();
      throw HttpException(message);
    }

    final group = Map<String, dynamic>.from(payload as Map);
    final polygon = _parseGroupPolygon(group['polygon']);
    final derivedCenter = polygon.isEmpty ? null : _polygonAverageCenter(polygon);
    return DataCollectionLocationGroup(
      locationGroupId: (group['locationGroupId'] as String? ?? '').trim(),
      buildingName: (group['name'] as String? ?? 'Study Location Group').trim(),
      centerLatitude:
          _readFiniteDouble(group['centerLatitude']) ??
          derivedCenter?.latitude ??
          centerLatitude,
      centerLongitude:
          _readFiniteDouble(group['centerLongitude']) ??
          derivedCenter?.longitude ??
          centerLongitude,
      radiusMeters: _readFiniteDouble(group['radiusMeters']) ?? 60,
      studyLocations: const <DataCollectionStudyLocation>[],
      polygon: polygon,
      hasExplicitBoundary:
          polygon.isNotEmpty ||
          (_readFiniteDouble(group['centerLatitude']) != null &&
              _readFiniteDouble(group['centerLongitude']) != null &&
              _readFiniteDouble(group['radiusMeters']) != null),
    );
  }

  Future<List<dynamic>> _getJsonList(String path) async {
    final response = await _send(path: path, method: 'GET');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw HttpException('Request failed with status ${response.statusCode}.');
    }

    final payload = await _decodeJson(response);
    if (payload is List<dynamic>) {
      return payload;
    }

    throw const FormatException('Expected a JSON list from backend.');
  }

  Future<HttpClientResponse> _sendJson({
    required String method,
    required String path,
    required Map<String, dynamic> body,
  }) async {
    final request = await _openRequest(path: path, method: method);
    request.headers.contentType = ContentType.json;
    request.write(jsonEncode(body));
    return request.close();
  }

  Future<HttpClientResponse> _send({
    required String path,
    required String method,
  }) async {
    final request = await _openRequest(path: path, method: method);
    return request.close();
  }

  Future<HttpClientRequest> _openRequest({
    required String path,
    required String method,
  }) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 6);
    final uri = Uri.parse('$_baseUrl$path');
    final request = await client.openUrl(method, uri).timeout(
          const Duration(seconds: 6),
        );
    request.persistentConnection = false;
    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
    return request;
  }

  Future<dynamic> _decodeJson(HttpClientResponse response) async {
    final text = await response.transform(utf8.decoder).join().timeout(
          const Duration(seconds: 6),
        );
    if (text.trim().isEmpty) {
      return <String, dynamic>{};
    }

    return jsonDecode(text);
  }

  DataCollectionStudyLocation _parseStudyLocation(
    Map<String, dynamic> location, {
    required String groupId,
    required String groupName,
    double? groupCenterLatitude,
    double? groupCenterLongitude,
    double? groupRadiusMeters,
    List<DataCollectionGroupVertex> groupPolygon =
        const <DataCollectionGroupVertex>[],
  }) {
    return DataCollectionStudyLocation(
      studyLocationId: (location['studyLocationId'] as String? ?? '').trim(),
      locationGroupId: groupId,
      locationName: (location['name'] as String? ?? 'Study Location').trim(),
      buildingName: groupName,
      floorLabel: (location['floorLabel'] as String? ?? '').trim(),
      sublocationLabel: (location['sublocationLabel'] as String? ?? '').trim(),
      latitude: (location['latitude'] as num?)?.toDouble() ?? 0,
      longitude: (location['longitude'] as num?)?.toDouble() ?? 0,
      groupCenterLatitude: groupCenterLatitude,
      groupCenterLongitude: groupCenterLongitude,
      groupRadiusMeters: groupRadiusMeters,
      groupPolygon: List<DataCollectionGroupVertex>.unmodifiable(groupPolygon),
    );
  }
}

double? _readFiniteDouble(Object? value) {
  final nextValue = (value as num?)?.toDouble();
  if (nextValue == null || !nextValue.isFinite) {
    return null;
  }

  return nextValue;
}

List<DataCollectionGroupVertex> _parseGroupPolygon(Object? value) {
  if (value is! List) {
    return const <DataCollectionGroupVertex>[];
  }

  return value
      .whereType<Map>()
      .map((entry) => Map<String, dynamic>.from(entry))
      .map(
        (entry) => DataCollectionGroupVertex(
          latitude: _readFiniteDouble(entry['latitude']) ?? double.nan,
          longitude: _readFiniteDouble(entry['longitude']) ?? double.nan,
        ),
      )
      .where(
        (vertex) => vertex.latitude.isFinite && vertex.longitude.isFinite,
      )
      .toList(growable: false);
}

SessionCoordinates? _polygonAverageCenter(
  List<DataCollectionGroupVertex> polygon,
) {
  if (polygon.isEmpty) {
    return null;
  }

  final latitude =
      polygon.map((vertex) => vertex.latitude).reduce((a, b) => a + b) /
      polygon.length;
  final longitude =
      polygon.map((vertex) => vertex.longitude).reduce((a, b) => a + b) /
      polygon.length;
  return SessionCoordinates(latitude: latitude, longitude: longitude);
}
