import 'dart:math' as math;
import 'dart:ui';

import 'data_collection_model.dart';

class SurfaceLineGeometry {
  const SurfaceLineGeometry({
    required this.points,
    required this.color,
    required this.strokeWidth,
  });

  final List<Offset> points;
  final Color color;
  final double strokeWidth;
}

class RippleGeometry {
  const RippleGeometry({
    required this.bounds,
    required this.color,
    required this.strokeWidth,
  });

  final Rect bounds;
  final Color color;
  final double strokeWidth;
}

class ParticleGeometry {
  const ParticleGeometry({
    required this.center,
    required this.radius,
    required this.color,
  });

  final Offset center;
  final double radius;
  final Color color;
}

class SurfaceRenderModel {
  const SurfaceRenderModel({
    required this.quietColor,
    required this.activeTint,
    required this.glowCenter,
    required this.glowRadius,
    required this.lines,
    required this.ripples,
    required this.particles,
  });

  final Color quietColor;
  final Color activeTint;
  final Offset glowCenter;
  final double glowRadius;
  final List<SurfaceLineGeometry> lines;
  final List<RippleGeometry> ripples;
  final List<ParticleGeometry> particles;
}

class NoiseBarRenderModel {
  const NoiseBarRenderModel({
    required this.progress,
    required this.fillWidth,
    required this.markerX,
  });

  final double progress;
  final double fillWidth;
  final double markerX;
}

double noiseBarProgress(NoiseDescriptor descriptor) {
  return switch (descriptor.label) {
    'Quiet' => descriptor.progress * 0.26,
    'Moderate' => 0.26 + (descriptor.progress * 0.24),
    'Lively' => 0.5 + (descriptor.progress * 0.24),
    _ => 0.74 + (descriptor.progress * 0.26),
  };
}

NoiseBarRenderModel buildNoiseBarRenderModel({
  required Size size,
  required NoiseDescriptor descriptor,
}) {
  final progress = noiseBarProgress(descriptor).clamp(0.0, 1.0).toDouble();
  return NoiseBarRenderModel(
    progress: progress,
    fillWidth: math.max(1.0, size.width * progress),
    markerX: size.width * progress,
  );
}

SurfaceRenderModel buildSurfaceRenderModel({
  required Size size,
  required SurfaceFrameState frame,
  required SurfaceConfig config,
}) {
  final quietColor = const Color(0xFF071A30);
  final activeTint = surfaceTint(frame.signal.smoothedLevel);
  final glowCenter = Offset(size.width * 0.5, size.height * 0.56);
  final glowRadius = size.shortestSide * 0.64;
  final elapsedMs = frame.signal.elapsed.inMilliseconds.toDouble();

  final ripples = frame.ripples
      .map((ripple) => buildRippleGeometry(
            ripple: ripple,
            nowMs: elapsedMs,
            size: size,
          ))
      .whereType<RippleGeometry>()
      .toList(growable: false);

  final lines = List<SurfaceLineGeometry>.generate(config.lineCount, (lineIndex) {
    final yNorm = lerpDouble(0.44, 0.92, lineIndex / (config.lineCount - 1))!;
    final sampleCount = math.max(18, (size.width / 18).floor());
    final points = List<Offset>.generate(sampleCount + 1, (sampleIndex) {
      final xNorm = sampleIndex / sampleCount;
      final displacement = sampleSurfaceY(
        x: xNorm,
        y: yNorm,
        baseTimeMs: elapsedMs,
        intensity: frame.signal.smoothedLevel,
        ripples: frame.ripples,
        config: config,
      );
      return Offset(
        xNorm * size.width,
        (yNorm * size.height) + (displacement * size.height),
      );
    }, growable: false);

    return SurfaceLineGeometry(
      points: points,
      color: Color.lerp(
        const Color(0xFF79DBFF),
        const Color(0xFFFF8BC4),
        lineIndex / config.lineCount,
      )!
          .withValues(alpha: 0.46),
      strokeWidth: lineIndex.isEven ? 2.2 : 1.6,
    );
  }, growable: false);

  final particles = List<ParticleGeometry>.generate(12, (index) {
    final x =
        ((index * 0.083) + (elapsedMs * 0.000012 * (index.isEven ? 1 : -1))) % 1;
    final y = 0.48 + ((math.sin((elapsedMs * 0.0012) + index) + 1) * 0.18);
    return ParticleGeometry(
      center: Offset(x * size.width, y * size.height),
      radius: index.isEven ? 3.2 : 2.4,
      color: (index % 3 == 0
              ? const Color(0xFF7CE8FF)
              : index.isEven
                  ? const Color(0xFFFF91DD)
                  : const Color(0xFFFFD564))
          .withValues(alpha: 0.64),
    );
  }, growable: false);

  return SurfaceRenderModel(
    quietColor: quietColor,
    activeTint: activeTint,
    glowCenter: glowCenter,
    glowRadius: glowRadius,
    lines: lines,
    ripples: ripples,
    particles: particles,
  );
}

RippleGeometry? buildRippleGeometry({
  required Ripple ripple,
  required double nowMs,
  required Size size,
}) {
  final radiusNorm = rippleRadiusAt(ripple, nowMs);
  final amplitude = rippleStrengthAt(ripple, nowMs);
  if (amplitude <= 0) {
    return null;
  }

  final center = Offset(ripple.originX * size.width, ripple.originY * size.height);
  final radiusX = radiusNorm * size.width;
  final radiusY = radiusX * 0.24;

  return RippleGeometry(
    bounds: Rect.fromCenter(
      center: Offset(center.dx, center.dy + (radiusY * 0.18)),
      width: radiusX * 2,
      height: radiusY * 2,
    ),
    color: const Color(0xFF8AE0FF).withValues(alpha: 0.1 + (amplitude * 0.24)),
    strokeWidth: lerpDouble(1.5, 4.5, amplitude) ?? 2,
  );
}

Color surfaceTint(double intensity) {
  if (intensity < 0.33) {
    return Color.lerp(
      const Color(0xFF2563EB),
      const Color(0xFF06B6D4),
      intensity / 0.33,
    )!;
  }

  if (intensity < 0.66) {
    return Color.lerp(
      const Color(0xFF06B6D4),
      const Color(0xFFFACC15),
      (intensity - 0.33) / 0.33,
    )!;
  }

  return Color.lerp(
    const Color(0xFFF97316),
    const Color(0xFFDC2626),
    (intensity - 0.66) / 0.34,
  )!;
}
