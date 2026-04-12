import 'dart:math' as math;

import '../config/app_tuning.dart';

enum OccupancyLevel { empty, sparse, moderate, busy, full }

extension OccupancyLevelX on OccupancyLevel {
  String get label => switch (this) {
        OccupancyLevel.empty => 'Empty',
        OccupancyLevel.sparse => 'Sparse',
        OccupancyLevel.moderate => 'Moderate',
        OccupancyLevel.busy => 'Busy',
        OccupancyLevel.full => 'Full',
      };

  double get sliderValue => index.toDouble();

  int get reportValue => index + 1;

  static OccupancyLevel fromSliderValue(double value) {
    final roundedIndex = value.round().clamp(0, OccupancyLevel.values.length - 1);
    return OccupancyLevel.values[roundedIndex];
  }
}

class NoiseDescriptor {
  const NoiseDescriptor({
    required this.label,
    required this.progress,
  });

  final String label;
  final double progress;
}

class AudioSignalSnapshot {
  const AudioSignalSnapshot({
    required this.elapsed,
    required this.rawLevel,
    required this.normalizedLevel,
    required this.smoothedLevel,
    required this.decibels,
    required this.descriptor,
  });

  final Duration elapsed;
  final double rawLevel;
  final double normalizedLevel;
  final double smoothedLevel;
  final double decibels;
  final NoiseDescriptor descriptor;
}

class Ripple {
  const Ripple({
    required this.id,
    required this.birthMs,
    required this.strength,
    required this.speed,
    required this.decayMs,
    required this.originX,
    required this.originY,
  });

  final int id;
  final double birthMs;
  final double strength;
  final double speed;
  final double decayMs;
  final double originX;
  final double originY;
}

class SurfaceConfig {
  const SurfaceConfig({
    this.noiseFloor = MobileSurfaceTuning.noiseFloor,
    this.smoothingFactor = MobileSurfaceTuning.smoothingFactor,
    this.peakThreshold = MobileSurfaceTuning.peakThreshold,
    this.peakRiseDelta = MobileSurfaceTuning.peakRiseDelta,
    this.peakCooldownMs = MobileSurfaceTuning.peakCooldownMs,
    this.rippleSpeed = MobileSurfaceTuning.rippleSpeed,
    this.rippleDecayMs = MobileSurfaceTuning.rippleDecayMs,
    this.rippleWidth = MobileSurfaceTuning.rippleWidth,
    this.maxActiveRipples = MobileSurfaceTuning.maxActiveRipples,
    this.baseAmplitude = MobileSurfaceTuning.baseAmplitude,
    this.rippleAmplitude = MobileSurfaceTuning.rippleAmplitude,
    this.lineCount = MobileSurfaceTuning.lineCount,
    this.minDecibels = MobileSurfaceTuning.minDecibels,
    this.maxDecibels = MobileSurfaceTuning.maxDecibels,
    this.quietThreshold = MobileSurfaceTuning.quietThreshold,
    this.moderateThreshold = MobileSurfaceTuning.moderateThreshold,
    this.livelyThreshold = MobileSurfaceTuning.livelyThreshold,
  });

  final double noiseFloor;
  final double smoothingFactor;
  final double peakThreshold;
  final double peakRiseDelta;
  final int peakCooldownMs;
  final double rippleSpeed;
  final int rippleDecayMs;
  final double rippleWidth;
  final int maxActiveRipples;
  final double baseAmplitude;
  final double rippleAmplitude;
  final int lineCount;
  final double minDecibels;
  final double maxDecibels;
  final double quietThreshold;
  final double moderateThreshold;
  final double livelyThreshold;
}

class SurfaceFrameState {
  const SurfaceFrameState({
    required this.signal,
    required this.ripples,
  });

  final AudioSignalSnapshot signal;
  final List<Ripple> ripples;
}

typedef SignalSampler = double Function(Duration elapsed);

double normalizeLevel(
  double rawLevel, {
  double noiseFloor = 0.08,
}) {
  if (rawLevel <= noiseFloor) {
    return 0;
  }

  final normalized = (rawLevel - noiseFloor) / (1 - noiseFloor);
  return normalized.clamp(0, 1);
}

double smoothLevel(
  double previous,
  double target, {
  double smoothingFactor = 0.18,
}) {
  final factor = smoothingFactor.clamp(0, 1);
  return (previous + ((target - previous) * factor)).clamp(0, 1);
}

double estimateDecibels(
  double intensity, {
  double minDecibels = 34,
  double maxDecibels = 86,
}) {
  final safeIntensity = intensity.clamp(0, 1);
  return minDecibels + ((maxDecibels - minDecibels) * safeIntensity);
}

bool detectPeak({
  required double previousLevel,
  required double currentLevel,
  required double nowMs,
  required double lastPeakMs,
  double threshold = 0.58,
  double riseDelta = 0.1,
  int cooldownMs = 320,
}) {
  final readyForNewPeak = nowMs - lastPeakMs >= cooldownMs;
  final steepEnough = currentLevel - previousLevel >= riseDelta;
  return readyForNewPeak && currentLevel >= threshold && steepEnough;
}

Ripple spawnRipple({
  required int id,
  required double nowMs,
  required double strength,
  required SurfaceConfig config,
  double originX = 0.5,
  double originY = 0.62,
}) {
  return Ripple(
    id: id,
    birthMs: nowMs,
    strength: strength.clamp(0, 1),
    speed: config.rippleSpeed,
    decayMs: config.rippleDecayMs.toDouble(),
    originX: originX.clamp(0, 1),
    originY: originY.clamp(0, 1),
  );
}

List<Ripple> advanceRipples(
  List<Ripple> ripples, {
  required double nowMs,
}) {
  return ripples
      .where((ripple) => nowMs - ripple.birthMs <= ripple.decayMs)
      .toList(growable: false);
}

double rippleRadiusAt(Ripple ripple, double nowMs) {
  final ageMs = math.max(0, nowMs - ripple.birthMs);
  return ageMs * ripple.speed;
}

double rippleStrengthAt(Ripple ripple, double nowMs) {
  final ageMs = math.max(0, nowMs - ripple.birthMs);
  final remaining = 1 - (ageMs / ripple.decayMs);
  return (ripple.strength * remaining).clamp(0, 1);
}

double sampleSurfaceY({
  required double x,
  required double y,
  required double baseTimeMs,
  required double intensity,
  required List<Ripple> ripples,
  required SurfaceConfig config,
}) {
  final safeX = x.clamp(0, 1);
  final safeY = y.clamp(0, 1);
  final t = baseTimeMs * 0.001;
  final intensityScale = 0.45 + (intensity.clamp(0, 1) * 0.75);

  var displacement =
      math.sin((safeX * 7.8) + (t * 1.35) + (safeY * 2.2)) * config.baseAmplitude;
  displacement +=
      math.sin((safeX * 14.5) - (t * 0.85) + (safeY * 3.8)) * config.baseAmplitude * 0.42;
  displacement *= intensityScale;

  for (final ripple in ripples) {
    final radius = rippleRadiusAt(ripple, baseTimeMs);
    final amplitude = rippleStrengthAt(ripple, baseTimeMs) * config.rippleAmplitude;
    if (amplitude <= 0) {
      continue;
    }

    final dx = safeX - ripple.originX;
    final dy = (safeY - ripple.originY) * 0.58;
    final distance = math.sqrt((dx * dx) + (dy * dy));
    final bandDistance = (distance - radius).abs();
    if (bandDistance > config.rippleWidth * 2.4) {
      continue;
    }

    final gaussian = math.exp(-math.pow(bandDistance / config.rippleWidth, 2) * 3.2);
    final wavePhase = math.cos((bandDistance / config.rippleWidth) * math.pi);
    displacement += gaussian * wavePhase * amplitude;
  }

  return displacement;
}

NoiseDescriptor describeNoise(
  double intensity, {
  SurfaceConfig config = const SurfaceConfig(),
}) {
  final safeIntensity = intensity.clamp(0, 1);

  if (safeIntensity < config.quietThreshold) {
    return NoiseDescriptor(
      label: 'Quiet',
      progress: (safeIntensity / config.quietThreshold).clamp(0, 1),
    );
  }

  if (safeIntensity < config.moderateThreshold) {
    return NoiseDescriptor(
      label: 'Moderate',
      progress: ((safeIntensity - config.quietThreshold) /
              (config.moderateThreshold - config.quietThreshold))
          .clamp(0, 1),
    );
  }

  if (safeIntensity < config.livelyThreshold) {
    return NoiseDescriptor(
      label: 'Lively',
      progress: ((safeIntensity - config.moderateThreshold) /
              (config.livelyThreshold - config.moderateThreshold))
          .clamp(0, 1),
    );
  }

  return NoiseDescriptor(
    label: 'Loud',
    progress: ((safeIntensity - config.livelyThreshold) / (1 - config.livelyThreshold))
        .clamp(0, 1),
  );
}

double demoSignalLevel(Duration elapsed) {
  final timeMs = elapsed.inMilliseconds % 12000;
  final time = timeMs / 1000;

  if (time < 2) {
    return 0.05 + (0.02 * (math.sin(time * 5.2) + 1) / 2);
  }

  if (time < 4.8) {
    return 0.18 + (0.08 * (math.sin(time * 4.4) + 1) / 2);
  }

  if (time < 7.2) {
    return 0.34 + (0.18 * (math.sin(time * 7.3) + 1) / 2);
  }

  if (time < 9.1) {
    return 0.62 + (0.2 * (math.sin(time * 9.1) + 1) / 2);
  }

  return 0.16 + (0.07 * (math.sin(time * 3.8) + 1) / 2);
}

class ProceduralSurfaceEngine {
  ProceduralSurfaceEngine({
    this.config = const SurfaceConfig(),
  });

  final SurfaceConfig config;

  double _smoothedLevel = 0;
  double _lastPeakMs = -100000;
  int _nextRippleId = 1;
  List<Ripple> _ripples = const [];

  SurfaceFrameState tick({
    required double rawLevel,
    required Duration elapsed,
  }) {
    final nowMs = elapsed.inMilliseconds.toDouble();
    final normalizedLevel = normalizeLevel(rawLevel, noiseFloor: config.noiseFloor);
    final previousLevel = _smoothedLevel;
    _smoothedLevel = smoothLevel(
      _smoothedLevel,
      normalizedLevel,
      smoothingFactor: config.smoothingFactor,
    );

    if (detectPeak(
      previousLevel: previousLevel,
      currentLevel: _smoothedLevel,
      nowMs: nowMs,
      lastPeakMs: _lastPeakMs,
      threshold: config.peakThreshold,
      riseDelta: config.peakRiseDelta,
      cooldownMs: config.peakCooldownMs,
    )) {
      _lastPeakMs = nowMs;
      final jitterSeed = (_nextRippleId % 4) - 1.5;
      final originX = (0.5 + (jitterSeed * 0.028)).clamp(0.32, 0.68);
      _ripples = [
        ..._ripples,
        spawnRipple(
          id: _nextRippleId++,
          nowMs: nowMs,
          strength: 0.42 + (_smoothedLevel * 0.58),
          config: config,
          originX: originX,
        ),
      ];
    }

    _ripples = advanceRipples(_ripples, nowMs: nowMs);
    if (_ripples.length > config.maxActiveRipples) {
      _ripples = _ripples.sublist(_ripples.length - config.maxActiveRipples);
    }

    final signal = AudioSignalSnapshot(
      elapsed: elapsed,
      rawLevel: rawLevel.clamp(0, 1),
      normalizedLevel: normalizedLevel,
      smoothedLevel: _smoothedLevel,
      decibels: estimateDecibels(
        _smoothedLevel,
        minDecibels: config.minDecibels,
        maxDecibels: config.maxDecibels,
      ),
      descriptor: describeNoise(_smoothedLevel, config: config),
    );

    return SurfaceFrameState(
      signal: signal,
      ripples: List<Ripple>.unmodifiable(_ripples),
    );
  }
}
