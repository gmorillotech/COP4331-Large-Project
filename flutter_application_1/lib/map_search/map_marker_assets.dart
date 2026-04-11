// Asset registry that maps (noiseBand, frameIndex) to Flutter asset paths.
//
// Mirrors the web's `mapMarkerAssets.ts`.

const _animatedDir = 'assets/map_markers/animated';
const _staticDir = 'assets/map_markers/static';

/// Registry: band 1–5, each with 3 frames.
const Map<int, List<String>> _animatedFrames = {
  1: ['$_animatedDir/1-1.svg', '$_animatedDir/1-2.svg', '$_animatedDir/1-3.svg'],
  2: ['$_animatedDir/2-1.svg', '$_animatedDir/2-2.svg', '$_animatedDir/2-3.svg'],
  3: ['$_animatedDir/3-1.svg', '$_animatedDir/3-2.svg', '$_animatedDir/3-3.svg'],
  4: ['$_animatedDir/4-1.svg', '$_animatedDir/4-2.svg', '$_animatedDir/4-3.svg'],
  5: ['$_animatedDir/5-1.svg', '$_animatedDir/5-2.svg', '$_animatedDir/5-3.svg'],
};

/// Returns the asset path for an animated marker frame.
///
/// [band] is 1–5 (noise level), [frameIndex] is 0–2.
String getAnimatedFramePath(int band, int frameIndex) {
  final frames = _animatedFrames[band.clamp(1, 5)]!;
  return frames[frameIndex.clamp(0, 2)];
}

/// Returns the static pin asset path.
///
/// [isSub] selects the sublocation variant.
String getStaticPinPath(bool isSub) {
  return isSub
      ? '$_staticDir/subLocationPin.svg'
      : '$_staticDir/LocationPin.svg';
}
