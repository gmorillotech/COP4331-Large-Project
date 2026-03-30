import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_application_1/data_collection/data_collection_model.dart';
import 'package:flutter_application_1/data_collection/data_collection_render_model.dart';

void main() {
  group('data collection render model', () {
    SurfaceFrameState buildFrame({
      required double intensity,
      required Duration elapsed,
      List<Ripple> ripples = const [],
    }) {
      return SurfaceFrameState(
        signal: AudioSignalSnapshot(
          elapsed: elapsed,
          rawLevel: intensity,
          normalizedLevel: intensity,
          smoothedLevel: intensity,
          decibels: estimateDecibels(intensity),
          descriptor: describeNoise(intensity),
        ),
        ripples: ripples,
      );
    }

    test('noise bar model maps descriptor to fill width and marker position', () {
      const size = Size(320, 28);
      const descriptor = NoiseDescriptor(label: 'Moderate', progress: 0.5);

      final model = buildNoiseBarRenderModel(size: size, descriptor: descriptor);

      expect(model.progress, closeTo(0.38, 0.001));
      expect(model.fillWidth, closeTo(121.6, 0.5));
      expect(model.markerX, closeTo(model.fillWidth, 0.001));
    });

    test('surface tint follows the heatmap palette direction', () {
      expect(surfaceTint(0.1), isNot(equals(surfaceTint(0.5))));
      expect(surfaceTint(0.5), isNot(equals(surfaceTint(0.9))));
    });

    test('surface render model builds expected line and particle counts', () {
      const config = SurfaceConfig(lineCount: 10);
      final frame = buildFrame(
        intensity: 0.42,
        elapsed: const Duration(milliseconds: 850),
      );

      final model = buildSurfaceRenderModel(
        size: const Size(360, 720),
        frame: frame,
        config: config,
      );

      expect(model.lines, hasLength(10));
      expect(model.particles, hasLength(12));
      expect(model.glowRadius, greaterThan(0));
    });

    test('rendered line points stay finite and within a plausible vertical band', () {
      final frame = buildFrame(
        intensity: 0.55,
        elapsed: const Duration(milliseconds: 1200),
      );

      final model = buildSurfaceRenderModel(
        size: const Size(400, 800),
        frame: frame,
        config: const SurfaceConfig(),
      );

      for (final line in model.lines) {
        for (final point in line.points) {
          expect(point.dx.isFinite, isTrue);
          expect(point.dy.isFinite, isTrue);
          expect(point.dx, inInclusiveRange(0, 400));
          expect(point.dy, inInclusiveRange(250, 820));
        }
      }
    });

    test('ripple geometry is omitted only after a ripple fully decays', () {
      const config = SurfaceConfig();
      final ripple = spawnRipple(
        id: 7,
        nowMs: 0,
        strength: 0.9,
        config: config,
      );

      final activeGeometry = buildRippleGeometry(
        ripple: ripple,
        nowMs: 600,
        size: const Size(400, 800),
      );
      final expiredGeometry = buildRippleGeometry(
        ripple: ripple,
        nowMs: config.rippleDecayMs + 10,
        size: const Size(400, 800),
      );

      expect(activeGeometry, isNotNull);
      expect(activeGeometry!.bounds.width, greaterThan(0));
      expect(expiredGeometry, isNull);
    });

    test('render model includes ripple geometry for active ripple events', () {
      const config = SurfaceConfig();
      final ripple = spawnRipple(
        id: 1,
        nowMs: 0,
        strength: 0.85,
        config: config,
      );
      final frame = buildFrame(
        intensity: 0.78,
        elapsed: const Duration(milliseconds: 500),
        ripples: [ripple],
      );

      final model = buildSurfaceRenderModel(
        size: const Size(412, 915),
        frame: frame,
        config: config,
      );

      expect(model.ripples, isNotEmpty);
      expect(model.ripples.first.bounds.center.dx, closeTo(206, 30));
      expect(model.ripples.first.strokeWidth, greaterThan(1));
    });

    test('particles stay within the drawable canvas', () {
      final model = buildSurfaceRenderModel(
        size: const Size(360, 720),
        frame: buildFrame(
          intensity: 0.64,
          elapsed: const Duration(milliseconds: 2400),
        ),
        config: const SurfaceConfig(),
      );

      for (final particle in model.particles) {
        expect(particle.center.dx, inInclusiveRange(0, 360));
        expect(particle.center.dy, inInclusiveRange(0, 720));
        expect(particle.radius, greaterThan(0));
      }
    });
  });
}
