// Shared animation clock for all map markers.
//
// Mirrors the web's `mapMarkerAnimation.ts`.
// Cycle: frame 0 → 1 → 2 → 1 → 0 (ping-pong).
// One full cycle = 4 steps × 800 ms = 3.2 s.

import 'package:flutter/scheduler.dart';

import 'map_marker_types.dart';

const int _stepDurationMs = 800;
const List<int> _sequence = [0, 1, 2, 1];

/// Pure function — computes animation state from a millisecond timestamp.
MarkerAnimationState computeAnimationState(int elapsedMs) {
  final cycleLength = _stepDurationMs * _sequence.length;
  final elapsed = elapsedMs % cycleLength;
  final stepIndex = elapsed ~/ _stepDurationMs;
  final progress = (elapsed % _stepDurationMs) / _stepDurationMs;

  return MarkerAnimationState(
    currentFrame: _sequence[stepIndex],
    nextFrame: _sequence[(stepIndex + 1) % _sequence.length],
    progress: progress,
  );
}

/// A single shared ticker that drives every animated marker on the map.
///
/// Create one instance per map screen and pass the [state] into every
/// marker widget. Call [dispose] when the screen is removed.
class MarkerAnimationClock {
  MarkerAnimationClock(TickerProvider vsync) {
    _ticker = vsync.createTicker(_onTick)..start();
  }

  late final Ticker _ticker;
  MarkerAnimationState _state = MarkerAnimationState.zero;

  MarkerAnimationState get state => _state;

  /// Callback invoked by the parent widget's [setState] after each step change.
  void Function()? onStateChanged;

  int _lastStep = -1;

  void _onTick(Duration elapsed) {
    final ms = elapsed.inMilliseconds;
    final cycleLength = _stepDurationMs * _sequence.length;
    final stepIndex = (ms % cycleLength) ~/ _stepDurationMs;

    if (stepIndex != _lastStep) {
      _lastStep = stepIndex;
      _state = computeAnimationState(ms);
      onStateChanged?.call();
    }
  }

  void dispose() {
    _ticker.dispose();
  }
}
