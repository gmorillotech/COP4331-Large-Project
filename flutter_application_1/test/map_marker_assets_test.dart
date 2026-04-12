import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_application_1/map_search/map_marker_assets.dart';

void main() {
  group('getAnimatedFramePath', () {
    test('returns {band}-{frameIndex+1}.svg for every in-range combination',
        () {
      for (var band = 1; band <= 5; band++) {
        for (var frameIndex = 0; frameIndex <= 2; frameIndex++) {
          final path = getAnimatedFramePath(band, frameIndex);
          expect(
            path,
            'assets/map_markers/animated/$band-${frameIndex + 1}.svg',
            reason: 'band=$band frameIndex=$frameIndex',
          );
        }
      }
    });

    test('clamps band below 1 to band 1', () {
      expect(
        getAnimatedFramePath(0, 0),
        'assets/map_markers/animated/1-1.svg',
      );
      expect(
        getAnimatedFramePath(-7, 2),
        'assets/map_markers/animated/1-3.svg',
      );
    });

    test('clamps band above 5 to band 5', () {
      expect(
        getAnimatedFramePath(6, 0),
        'assets/map_markers/animated/5-1.svg',
      );
      expect(
        getAnimatedFramePath(99, 1),
        'assets/map_markers/animated/5-2.svg',
      );
    });

    test('clamps frameIndex below 0 to frame 1 (index 0)', () {
      expect(
        getAnimatedFramePath(3, -1),
        'assets/map_markers/animated/3-1.svg',
      );
    });

    test('clamps frameIndex above 2 to frame 3 (index 2)', () {
      expect(
        getAnimatedFramePath(3, 3),
        'assets/map_markers/animated/3-3.svg',
      );
      expect(
        getAnimatedFramePath(3, 99),
        'assets/map_markers/animated/3-3.svg',
      );
    });
  });

  group('getStaticPinPath', () {
    test('returns LocationPin.svg when isSub is false', () {
      expect(
        getStaticPinPath(false),
        'assets/map_markers/static/LocationPin.svg',
      );
    });

    test('returns subLocationPin.svg when isSub is true', () {
      expect(
        getStaticPinPath(true),
        'assets/map_markers/static/subLocationPin.svg',
      );
    });
  });
}
