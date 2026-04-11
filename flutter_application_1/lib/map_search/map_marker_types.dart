// Marker-state types shared between the asset registry, animation engine,
// and marker widget.

/// Noise-band values 1–5, matching the server's `toNoiseBand()` output.
typedef NoiseBand = int;

/// Immutable snapshot of the shared animation clock.
///
/// Every animated marker reads from the same instance each frame so all
/// markers stay synchronized.
class MarkerAnimationState {
  const MarkerAnimationState({
    required this.currentFrame,
    required this.nextFrame,
    required this.progress,
  });

  /// Index into the 3-frame asset array (0, 1, or 2).
  final int currentFrame;

  /// The frame we are transitioning toward.
  final int nextFrame;

  /// 0 = fully showing [currentFrame], 1 = fully showing [nextFrame].
  final double progress;

  static const zero = MarkerAnimationState(
    currentFrame: 0,
    nextFrame: 1,
    progress: 0,
  );
}
