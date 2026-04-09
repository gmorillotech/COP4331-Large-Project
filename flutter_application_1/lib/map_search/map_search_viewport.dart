import 'package:flutter/foundation.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

@immutable
class MapSearchViewport {
  const MapSearchViewport({required this.center, required this.zoom});

  factory MapSearchViewport.fromCameraPosition(CameraPosition position) {
    return MapSearchViewport(center: position.target, zoom: position.zoom);
  }

  final LatLng center;
  final double zoom;
}

Map<String, String> buildMapSearchQueryParameters({
  required MapSearchViewport viewport,
  required List<String> sortTerms,
  required bool includeGroups,
  required bool includeLocations,
  required double maxRadiusMeters,
  String query = '',
  double? minNoise,
  double? maxNoise,
  double? maxOccupancy,
}) {
  final queryParameters = <String, String>{
    'sortBy': sortTerms.isEmpty ? 'relevance' : sortTerms.join(','),
    'includeGroups': '$includeGroups',
    'includeLocations': '$includeLocations',
    'lat': viewport.center.latitude.toStringAsFixed(6),
    'lng': viewport.center.longitude.toStringAsFixed(6),
    'maxRadiusMeters': maxRadiusMeters.round().toString(),
  };

  final normalizedQuery = query.trim();
  if (normalizedQuery.isNotEmpty) {
    queryParameters['q'] = normalizedQuery;
  }
  if (minNoise != null) {
    queryParameters['minNoise'] = minNoise.toStringAsFixed(0);
  }
  if (maxNoise != null) {
    queryParameters['maxNoise'] = maxNoise.toStringAsFixed(0);
  }
  if (maxOccupancy != null) {
    queryParameters['maxOccupancy'] = maxOccupancy.toStringAsFixed(1);
  }

  return queryParameters;
}
