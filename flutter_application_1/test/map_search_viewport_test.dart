import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_application_1/map_search/map_search_viewport.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

void main() {
  group('map search viewport', () {
    test('captures the latest camera target and zoom', () {
      const cameraPosition = CameraPosition(
        target: LatLng(28.612345, -81.197531),
        zoom: 17.25,
      );

      final viewport = MapSearchViewport.fromCameraPosition(cameraPosition);

      expect(viewport.center, cameraPosition.target);
      expect(viewport.zoom, cameraPosition.zoom);
    });

    test('builds search params from the live viewport center', () {
      const viewport = MapSearchViewport(
        center: LatLng(28.612345, -81.197531),
        zoom: 17.25,
      );

      final queryParameters = buildMapSearchQueryParameters(
        viewport: viewport,
        sortTerms: const ['relevance', 'distance'],
        includeGroups: true,
        includeLocations: true,
        maxRadiusMeters: 300,
        query: 'engineering',
        minNoise: 30,
        maxNoise: 60,
        maxOccupancy: 2.5,
      );

      expect(queryParameters['lat'], '28.612345');
      expect(queryParameters['lng'], '-81.197531');
      expect(queryParameters['sortBy'], 'relevance,distance');
      expect(queryParameters['includeGroups'], 'true');
      expect(queryParameters['includeLocations'], 'true');
      expect(queryParameters['maxRadiusMeters'], '300');
      expect(queryParameters['q'], 'engineering');
      expect(queryParameters['minNoise'], '30');
      expect(queryParameters['maxNoise'], '60');
      expect(queryParameters['maxOccupancy'], '2.5');
    });
  });
}
