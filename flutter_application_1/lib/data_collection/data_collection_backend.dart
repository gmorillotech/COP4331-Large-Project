import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

import 'data_collection_workflow.dart';

const String _configuredReportsApiBaseUrl =
    String.fromEnvironment('REPORTS_API_BASE_URL');

String defaultDataCollectionApiBaseUrl() {
  if (_configuredReportsApiBaseUrl.isNotEmpty) {
    return _configuredReportsApiBaseUrl;
  }

  if (kIsWeb) {
    return 'http://localhost:5050';
  }

  if (Platform.isAndroid) {
    return 'http://10.0.2.2:5050';
  }

  return 'http://localhost:5050';
}

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
  }) : _baseUrl = (baseUrl ?? defaultDataCollectionApiBaseUrl()).trim();

  final String _baseUrl;

  @override
  Future<List<DataCollectionStudyLocation>> fetchStudyLocations() async {
    final groupsPayload = await _getJsonList('/api/locations/groups');
    final studyLocations = <DataCollectionStudyLocation>[];

    for (final groupEntry in groupsPayload) {
      final group = Map<String, dynamic>.from(groupEntry as Map);
      final groupId = (group['locationGroupId'] as String? ?? '').trim();
      final groupName = (group['name'] as String? ?? 'Unknown Building').trim();
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
          _parseStudyLocation(location, groupId: groupId, groupName: groupName),
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
    return DataCollectionLocationGroup(
      locationGroupId: (group['locationGroupId'] as String? ?? '').trim(),
      buildingName: (group['name'] as String? ?? 'Study Location Group').trim(),
      centerLatitude: (group['centerLatitude'] as num?)?.toDouble() ??
          centerLatitude,
      centerLongitude: (group['centerLongitude'] as num?)?.toDouble() ??
          centerLongitude,
      radiusMeters:
          (group['radiusMeters'] as num?)?.toDouble() ?? 60,
      studyLocations: const <DataCollectionStudyLocation>[],
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
    );
  }
}
