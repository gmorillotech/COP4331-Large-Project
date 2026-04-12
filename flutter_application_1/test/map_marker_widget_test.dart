import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_application_1/map_search/map_marker_types.dart';
import 'package:flutter_application_1/map_search/map_marker_widget.dart';

Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: Center(child: child)));

void main() {
  group('MapMarkerVisual — static pin', () {
    testWidgets('isAnimated=false renders no crossfade Stack', (tester) async {
      await tester.pumpWidget(_wrap(const MapMarkerVisual(
        size: 48,
        isAnimated: false,
        noiseBand: 3,
        isSub: false,
        isSelected: false,
        animation: MarkerAnimationState.zero,
      )));

      // Static path: SizedBox > SvgPicture — no Stack
      expect(find.byType(Stack), findsNothing);
      expect(find.byType(SvgPicture), findsOneWidget);
    });

    testWidgets('isAnimated=false and noiseBand=null renders static pin', (tester) async {
      await tester.pumpWidget(_wrap(const MapMarkerVisual(
        size: 48,
        isAnimated: false,
        noiseBand: null,
        isSub: false,
        isSelected: false,
        animation: MarkerAnimationState.zero,
      )));

      expect(find.byType(Stack), findsNothing);
      expect(find.byType(SvgPicture), findsOneWidget);
    });

    testWidgets('isSub=true uses subLocation pin variant', (tester) async {
      await tester.pumpWidget(_wrap(const MapMarkerVisual(
        size: 36,
        isAnimated: false,
        noiseBand: null,
        isSub: true,
        isSelected: false,
        animation: MarkerAnimationState.zero,
      )));

      expect(find.byType(Stack), findsNothing);
      final svg = tester.widget<SvgPicture>(find.byType(SvgPicture));
      // Should load the subLocationPin asset
      final loader = svg.bytesLoader;
      expect(loader.toString(), contains('subLocationPin'));
    });
  });

  group('MapMarkerVisual — animated crossfade', () {
    testWidgets('isAnimated=true + noiseBand set renders crossfade Stack', (tester) async {
      await tester.pumpWidget(_wrap(const MapMarkerVisual(
        size: 48,
        isAnimated: true,
        noiseBand: 5,
        isSub: false,
        isSelected: false,
        animation: MarkerAnimationState(currentFrame: 0, nextFrame: 1, progress: 0.5),
      )));

      expect(find.byType(Stack), findsOneWidget);
      // Two Opacity + two SvgPicture for the crossfade
      expect(find.byType(Opacity), findsNWidgets(2));
      expect(find.byType(SvgPicture), findsNWidgets(2));
    });

    testWidgets('progress=0 → currentFrame fully opaque, nextFrame transparent', (tester) async {
      await tester.pumpWidget(_wrap(const MapMarkerVisual(
        size: 48,
        isAnimated: true,
        noiseBand: 3,
        isSub: false,
        isSelected: false,
        animation: MarkerAnimationState(currentFrame: 0, nextFrame: 1, progress: 0.0),
      )));

      final opacities = tester.widgetList<Opacity>(find.byType(Opacity)).toList();
      expect(opacities[0].opacity, closeTo(1.0, 0.001)); // 1 - 0.0
      expect(opacities[1].opacity, closeTo(0.0, 0.001)); // 0.0
    });

    testWidgets('progress=1 → currentFrame transparent, nextFrame fully opaque', (tester) async {
      await tester.pumpWidget(_wrap(const MapMarkerVisual(
        size: 48,
        isAnimated: true,
        noiseBand: 3,
        isSub: false,
        isSelected: false,
        animation: MarkerAnimationState(currentFrame: 0, nextFrame: 1, progress: 1.0),
      )));

      final opacities = tester.widgetList<Opacity>(find.byType(Opacity)).toList();
      expect(opacities[0].opacity, closeTo(0.0, 0.001)); // 1 - 1.0
      expect(opacities[1].opacity, closeTo(1.0, 0.001)); // 1.0
    });

    testWidgets('progress=0.5 → both frames at 50% opacity', (tester) async {
      await tester.pumpWidget(_wrap(const MapMarkerVisual(
        size: 48,
        isAnimated: true,
        noiseBand: 2,
        isSub: false,
        isSelected: false,
        animation: MarkerAnimationState(currentFrame: 1, nextFrame: 2, progress: 0.5),
      )));

      final opacities = tester.widgetList<Opacity>(find.byType(Opacity)).toList();
      expect(opacities[0].opacity, closeTo(0.5, 0.001));
      expect(opacities[1].opacity, closeTo(0.5, 0.001));
    });

    testWidgets('all 5 bands render without error', (tester) async {
      for (var band = 1; band <= 5; band++) {
        await tester.pumpWidget(_wrap(MapMarkerVisual(
          size: 48,
          isAnimated: true,
          noiseBand: band,
          isSub: false,
          isSelected: false,
          animation: const MarkerAnimationState(currentFrame: 0, nextFrame: 1, progress: 0.3),
        )));
        expect(find.byType(Stack), findsOneWidget,
            reason: 'band $band should render animated Stack');
      }
    });
  });
}
