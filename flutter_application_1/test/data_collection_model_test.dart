import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_application_1/data_collection/data_collection_model.dart';

void main() {
  group('data collection model', () {
    test('normalizeLevel clamps and ignores the noise floor', () {
      expect(normalizeLevel(0.03), 0);
      expect(normalizeLevel(0.08), 0);
      expect(normalizeLevel(1.6), 1);
      expect(normalizeLevel(0.54), closeTo(0.5, 0.03));
    });

    test('smoothLevel dampens spikes', () {
      final smoothed = smoothLevel(0.2, 1, smoothingFactor: 0.25);
      expect(smoothed, closeTo(0.4, 0.001));
      expect(smoothed, lessThan(1));
    });

    test('peak detection respects threshold and cooldown', () {
      expect(
        detectPeak(
          previousLevel: 0.25,
          currentLevel: 0.72,
          nowMs: 1000,
          lastPeakMs: 200,
        ),
        isTrue,
      );

      expect(
        detectPeak(
          previousLevel: 0.25,
          currentLevel: 0.72,
          nowMs: 420,
          lastPeakMs: 200,
        ),
        isFalse,
      );

      expect(
        detectPeak(
          previousLevel: 0.55,
          currentLevel: 0.6,
          nowMs: 1000,
          lastPeakMs: 200,
        ),
        isFalse,
      );
    });

    test('ripple radius grows and strength decays over time', () {
      const config = SurfaceConfig();
      final ripple = spawnRipple(
        id: 1,
        nowMs: 0,
        strength: 0.9,
        config: config,
      );

      expect(rippleRadiusAt(ripple, 300), greaterThan(rippleRadiusAt(ripple, 100)));
      expect(rippleStrengthAt(ripple, 300), lessThan(rippleStrengthAt(ripple, 100)));
    });

    test('expired ripples are removed', () {
      const config = SurfaceConfig(rippleDecayMs: 1000);
      final ripples = [
        spawnRipple(id: 1, nowMs: 0, strength: 0.7, config: config),
        spawnRipple(id: 2, nowMs: 600, strength: 0.8, config: config),
      ];

      final advanced = advanceRipples(ripples, nowMs: 1201);
      expect(advanced.map((ripple) => ripple.id), [2]);
    });

    test('surface sampling is deterministic and stronger near a ripple front', () {
      const config = SurfaceConfig();
      final ripple = spawnRipple(
        id: 1,
        nowMs: 0,
        strength: 1,
        config: config,
      );

      final sampleA = sampleSurfaceY(
        x: 0.61,
        y: 0.62,
        baseTimeMs: 500,
        intensity: 0.6,
        ripples: [ripple],
        config: config,
      );

      final sampleB = sampleSurfaceY(
        x: 0.61,
        y: 0.62,
        baseTimeMs: 500,
        intensity: 0.6,
        ripples: [ripple],
        config: config,
      );

      final nearFront = sampleSurfaceY(
        x: 0.61,
        y: 0.62,
        baseTimeMs: 500,
        intensity: 0.6,
        ripples: [ripple],
        config: config,
      ).abs();

      final farAway = sampleSurfaceY(
        x: 0.95,
        y: 0.2,
        baseTimeMs: 500,
        intensity: 0.6,
        ripples: [ripple],
        config: config,
      ).abs();

      expect(sampleA, closeTo(sampleB, 0.000001));
      expect(nearFront, greaterThan(farAway));
    });

    test('multiple ripples combine safely', () {
      const config = SurfaceConfig();
      final ripples = [
        spawnRipple(id: 1, nowMs: 0, strength: 0.7, config: config),
        spawnRipple(id: 2, nowMs: 200, strength: 0.9, config: config, originX: 0.56),
      ];

      final sample = sampleSurfaceY(
        x: 0.52,
        y: 0.6,
        baseTimeMs: 720,
        intensity: 0.82,
        ripples: ripples,
        config: config,
      );

      expect(sample.isFinite, isTrue);
    });

    test('qualitative labels map correctly', () {
      expect(describeNoise(0.1).label, 'Quiet');
      expect(describeNoise(0.34).label, 'Moderate');
      expect(describeNoise(0.62).label, 'Lively');
      expect(describeNoise(0.9).label, 'Loud');
    });

    test('occupancy levels only map to the five fixed states', () {
      expect(OccupancyLevelX.fromSliderValue(0), OccupancyLevel.empty);
      expect(OccupancyLevelX.fromSliderValue(1), OccupancyLevel.sparse);
      expect(OccupancyLevelX.fromSliderValue(2), OccupancyLevel.moderate);
      expect(OccupancyLevelX.fromSliderValue(3), OccupancyLevel.busy);
      expect(OccupancyLevelX.fromSliderValue(4), OccupancyLevel.full);
      expect(OccupancyLevelX.fromSliderValue(7), OccupancyLevel.full);
    });

    test('engine produces ripple events for strong synthetic peaks', () {
      const config = SurfaceConfig(
        peakThreshold: 0.18,
        peakRiseDelta: 0.04,
        smoothingFactor: 1,
      );
      final engine = ProceduralSurfaceEngine(config: config);

      engine.tick(rawLevel: 0.1, elapsed: const Duration(milliseconds: 0));
      final result = engine.tick(rawLevel: 0.9, elapsed: const Duration(milliseconds: 600));

      expect(result.ripples, isNotEmpty);
      expect(result.signal.decibels, greaterThan(50));
    });
  });
}
