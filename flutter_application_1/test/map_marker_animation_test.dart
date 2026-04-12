import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_application_1/map_search/map_marker_animation.dart';

void main() {
  group('computeAnimationState', () {
    // Cycle: [0, 1, 2, 1] ping-pong, 800 ms per step, 3200 ms full cycle.

    test('at t=0: current=0, next=1, progress=0', () {
      final s = computeAnimationState(0);
      expect(s.currentFrame, 0);
      expect(s.nextFrame, 1);
      expect(s.progress, closeTo(0.0, 1e-9));
    });

    test('at t=400 (mid step 0): current=0, next=1, progress=0.5', () {
      final s = computeAnimationState(400);
      expect(s.currentFrame, 0);
      expect(s.nextFrame, 1);
      expect(s.progress, closeTo(0.5, 1e-9));
    });

    test('at t=800 (step 1 boundary): current=1, next=2, progress=0', () {
      final s = computeAnimationState(800);
      expect(s.currentFrame, 1);
      expect(s.nextFrame, 2);
      expect(s.progress, closeTo(0.0, 1e-9));
    });

    test('at t=1600 (step 2 boundary): current=2, next=1, progress=0', () {
      final s = computeAnimationState(1600);
      expect(s.currentFrame, 2);
      expect(s.nextFrame, 1);
      expect(s.progress, closeTo(0.0, 1e-9));
    });

    test('at t=2400 (step 3 boundary): current=1, next=0, progress=0', () {
      // Step 3 is the second '1' in the ping-pong; next wraps to index 0.
      final s = computeAnimationState(2400);
      expect(s.currentFrame, 1);
      expect(s.nextFrame, 0);
      expect(s.progress, closeTo(0.0, 1e-9));
    });

    test('at t=3200 (one full cycle): wraps back to t=0 state', () {
      final s = computeAnimationState(3200);
      expect(s.currentFrame, 0);
      expect(s.nextFrame, 1);
      expect(s.progress, closeTo(0.0, 1e-9));
    });

    test('samples across a full cycle follow the ping-pong sequence', () {
      // Check the step index at each 800ms boundary produces the expected
      // currentFrame: [0, 1, 2, 1].
      expect(computeAnimationState(0).currentFrame, 0);
      expect(computeAnimationState(800).currentFrame, 1);
      expect(computeAnimationState(1600).currentFrame, 2);
      expect(computeAnimationState(2400).currentFrame, 1);
    });

    test('state at t and t + one cycle (3200ms) are equivalent', () {
      for (final t in const [0, 200, 500, 800, 1100, 1900, 2700]) {
        final a = computeAnimationState(t);
        final b = computeAnimationState(t + 3200);
        expect(a.currentFrame, b.currentFrame, reason: 't=$t');
        expect(a.nextFrame, b.nextFrame, reason: 't=$t');
        expect(a.progress, closeTo(b.progress, 1e-9), reason: 't=$t');
      }
    });
  });
}
