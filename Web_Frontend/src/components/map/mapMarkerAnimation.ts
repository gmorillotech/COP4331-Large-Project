// mapMarkerAnimation — shared synchronized animation clock for all map markers.
//
// The animation cycle is: frame 1 → 2 → 3 → 2 → 1 (ping-pong).
// One full cycle = 4 transition steps × STEP_DURATION_MS each.
//
// The hook returns:
//   - currentFrame (0 | 1 | 2)  — index into the 3-frame asset array
//   - nextFrame    (0 | 1 | 2)  — the frame we're transitioning toward
//   - progress     (0 … 1)      — how far along the crossfade is

import { useEffect, useRef, useState } from 'react';

// Duration of each transition step in milliseconds.
// 800ms × 4 steps = 3.2s per full cycle.
const STEP_DURATION_MS = 800;

// The ping-pong sequence expressed as frame indices: 0 → 1 → 2 → 1 → (back to 0)
const SEQUENCE = [0, 1, 2, 1] as const;
const SEQUENCE_LENGTH = SEQUENCE.length;

export type AnimationState = {
  currentFrame: 0 | 1 | 2;
  nextFrame: 0 | 1 | 2;
  progress: number; // 0 = fully showing currentFrame, 1 = fully showing nextFrame
};

/**
 * Computes animation state from an absolute timestamp.
 * Pure function — no side effects, easy to test.
 */
export function computeAnimationState(now: number): AnimationState {
  const elapsed = now % (STEP_DURATION_MS * SEQUENCE_LENGTH);
  const stepIndex = Math.floor(elapsed / STEP_DURATION_MS);
  const progress = (elapsed % STEP_DURATION_MS) / STEP_DURATION_MS;

  const currentFrame = SEQUENCE[stepIndex] as 0 | 1 | 2;
  const nextFrame = SEQUENCE[(stepIndex + 1) % SEQUENCE_LENGTH] as 0 | 1 | 2;

  return { currentFrame, nextFrame, progress };
}

/**
 * React hook that drives a shared animation clock.
 * All markers on the page share the same state because they all read from
 * the same requestAnimationFrame loop via this single hook instance.
 */
export function useMarkerAnimation(): AnimationState {
  const [state, setState] = useState<AnimationState>(() =>
    computeAnimationState(performance.now()),
  );
  const lastStepRef = useRef(-1);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now % (STEP_DURATION_MS * SEQUENCE_LENGTH);
      const stepIndex = Math.floor(elapsed / STEP_DURATION_MS);

      if (stepIndex !== lastStepRef.current) {
        lastStepRef.current = stepIndex;
        setState(computeAnimationState(now));
      }
    }, STEP_DURATION_MS);

    return () => window.clearInterval(id);
  }, []);

  return state;
}
