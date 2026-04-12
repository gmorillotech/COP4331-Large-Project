import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_application_1/map_search/map_marker_animation.dart';
import 'package:flutter_application_1/map_search/map_marker_types.dart';

void main() {
  // One full cycle = 4 steps × 800 ms = 3200 ms
  // Sequence: frame indices [0, 1, 2, 1]

  group('computeAnimationState', () {
    test('t=0 → currentFrame=0, nextFrame=1, progress=0', () {
      final s = computeAnimationState(0);
      expect(s.currentFrame, 0);
      expect(s.nextFrame, 1);
      expect(s.progress, 0.0);
    });

    test('t=800 → currentFrame=1, nextFrame=2, progress=0', () {
      final s = computeAnimationState(800);
      expect(s.currentFrame, 1);
      expect(s.nextFrame, 2);
      expect(s.progress, closeTo(0.0, 0.001));
    });

    test('t=1600 → currentFrame=2, nextFrame=1, progress=0', () {
      final s = computeAnimationState(1600);
      expect(s.currentFrame, 2);
      expect(s.nextFrame, 1);
      expect(s.progress, closeTo(0.0, 0.001));
    });

    test('t=2400 → currentFrame=1, nextFrame=0, progress=0', () {
      final s = computeAnimationState(2400);
      expect(s.currentFrame, 1);
      expect(s.nextFrame, 0);
      expect(s.progress, closeTo(0.0, 0.001));
    });

    test('t=400 → mid first transition, progress=0.5', () {
      final s = computeAnimationState(400);
      expect(s.currentFrame, 0);
      expect(s.nextFrame, 1);
      expect(s.progress, closeTo(0.5, 0.001));
    });

    test('t=1200 → mid third transition, progress=0.5', () {
      final s = computeAnimationState(1200);
      expect(s.currentFrame, 2);
      expect(s.nextFrame, 1);
      // This is actually step 1 (0-800 = step0, 800-1600=step1)
      // 1200 ms → stepIndex=1, elapsed in step=400 → progress=0.5
      expect(s.progress, closeTo(0.5, 0.001));
    });

    test('cycle wraps: t=3200 identical to t=0', () {
      final a = computeAnimationState(0);
      final b = computeAnimationState(3200);
      expect(b.currentFrame, a.currentFrame);
      expect(b.nextFrame, a.nextFrame);
      expect(b.progress, closeTo(a.progress, 0.001));
    });

    test('cycle wraps: t=3600 identical to t=400', () {
      final a = computeAnimationState(400);
      final b = computeAnimationState(3600);
      expect(b.currentFrame, a.currentFrame);
      expect(b.nextFrame, a.nextFrame);
      expect(b.progress, closeTo(a.progress, 0.001));
    });

    test('progress stays in [0, 1) range for all steps', () {
      for (var t = 0; t < 3200; t += 50) {
        final s = computeAnimationState(t);
        expect(s.progress, greaterThanOrEqualTo(0.0));
        expect(s.progress, lessThan(1.0));
      }
    });

    test('frames are always valid indices (0, 1, or 2)', () {
      for (var t = 0; t < 3200; t += 50) {
        final s = computeAnimationState(t);
        expect([0, 1, 2].contains(s.currentFrame), isTrue,
            reason: 't=$t: currentFrame=${s.currentFrame} out of range');
        expect([0, 1, 2].contains(s.nextFrame), isTrue,
            reason: 't=$t: nextFrame=${s.nextFrame} out of range');
      }
    });
  });

  group('MarkerAnimationState.zero', () {
    test('zero state has expected defaults', () {
      const s = MarkerAnimationState.zero;
      expect(s.currentFrame, 0);
      expect(s.nextFrame, 1);
      expect(s.progress, 0.0);
    });
  });
}
