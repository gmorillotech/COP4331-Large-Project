// Marker widget that renders either an animated crossfaded SVG pair
// or a static pin, mirroring the web's `MapMarkerVisual.tsx`.

import 'dart:ui' as ui;

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
    final content = (isAnimated && noiseBand != null)
        ? _buildAnimated()
        : _buildStatic();
    return _wrapSelected(content);
  }

  /// Mirrors the web's `.marker-visual.is-selected` CSS:
  ///   transform: scale(1.15);
  ///   filter: drop-shadow(0 0 6px rgba(0, 0, 0, 0.3));
  ///
  /// The shadow layer is a blurred, alpha-tinted copy of the marker's
  /// current silhouette stacked behind the live content, so it follows the
  /// SVG alpha rather than the widget bounding box.
  Widget _wrapSelected(Widget child) {
    if (!isSelected) return child;
    return Transform.scale(
      scale: 1.15,
      alignment: Alignment.bottomCenter,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Positioned.fill(
            child: IgnorePointer(
              child: ImageFiltered(
                imageFilter: ui.ImageFilter.blur(sigmaX: 3, sigmaY: 3),
                child: ColorFiltered(
                  colorFilter: const ColorFilter.mode(
                    Color.fromRGBO(0, 0, 0, 0.3),
                    BlendMode.srcIn,
                  ),
                  child: _buildShadowSource(),
                ),
              ),
            ),
          ),
          child,
        ],
      ),
    );
  }

  /// Single non-crossfaded SVG used as the alpha silhouette for the shadow.
  Widget _buildShadowSource() {
    final path = (isAnimated && noiseBand != null)
        ? getAnimatedFramePath(noiseBand!, animation.currentFrame)
        : getStaticPinPath(isSub);
    return SvgPicture.asset(path, width: size, height: size);
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
