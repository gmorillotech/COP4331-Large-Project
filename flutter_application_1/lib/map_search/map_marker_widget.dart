// Marker widget that renders either an animated crossfaded SVG pair
// or a static pin, mirroring the web's `MapMarkerVisual.tsx`.

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import 'map_marker_assets.dart';
import 'map_marker_types.dart';

/// Renders a single map marker.
///
/// When [isAnimated] is true and [noiseBand] is non-null, it crossfades
/// between two SVG frames driven by [animation]. Otherwise it shows a
/// static pin.
class MapMarkerVisual extends StatelessWidget {
  const MapMarkerVisual({
    super.key,
    required this.size,
    required this.isAnimated,
    required this.noiseBand,
    required this.isSub,
    required this.isSelected,
    required this.animation,
  });

  final double size;
  final bool isAnimated;
  final int? noiseBand;
  final bool isSub;
  final bool isSelected;
  final MarkerAnimationState animation;

  @override
  Widget build(BuildContext context) {
    if (isAnimated && noiseBand != null) {
      return _buildAnimated();
    }
    return _buildStatic();
  }

  Widget _buildAnimated() {
    final currentPath = getAnimatedFramePath(noiseBand!, animation.currentFrame);
    final nextPath = getAnimatedFramePath(noiseBand!, animation.nextFrame);

    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        children: [
          Positioned.fill(
            child: Opacity(
              opacity: 1 - animation.progress,
              child: SvgPicture.asset(
                currentPath,
                width: size,
                height: size,
              ),
            ),
          ),
          Positioned.fill(
            child: Opacity(
              opacity: animation.progress,
              child: SvgPicture.asset(
                nextPath,
                width: size,
                height: size,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatic() {
    final path = getStaticPinPath(isSub);

    return SizedBox(
      width: size,
      height: size,
      child: SvgPicture.asset(
        path,
        width: size,
        height: size,
      ),
    );
  }
}
