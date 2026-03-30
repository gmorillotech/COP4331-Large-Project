import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_application_1/data_collection/data_collection_screen.dart';
import 'package:flutter_application_1/data_collection/data_collection_workflow.dart';

void main() {
  late InMemoryReportDraftRepository repository;

  setUp(() {
    repository = InMemoryReportDraftRepository.instance;
    repository.clear();
  });

  testWidgets('data collection screen renders core controls', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: DataCollectionScreen(draftRepository: repository),
      ),
    );

    expect(find.byKey(const Key('data-collection-screen')), findsOneWidget);
    expect(find.byKey(const Key('decibel-readout')), findsOneWidget);
    expect(find.byKey(const Key('noise-bar')), findsOneWidget);
    expect(find.byKey(const Key('occupancy-slider')), findsOneWidget);
    expect(find.byKey(const Key('stable-mic')), findsOneWidget);
    expect(find.byKey(const Key('location-dropdown')), findsOneWidget);
    expect(find.byKey(const Key('start-capture-button')), findsOneWidget);
    expect(find.byKey(const Key('save-draft-button')), findsOneWidget);
    expect(find.byKey(const Key('signal-history-chart')), findsOneWidget);
    expect(find.byKey(const Key('capture-progress-bar')), findsOneWidget);
  });

  testWidgets('occupancy slider exposes exactly five levels', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: DataCollectionScreen(draftRepository: repository),
      ),
    );

    final slider = tester.widget<Slider>(find.byType(Slider));
    expect(slider.divisions, 4);

    slider.onChanged?.call(0);
    await tester.pump();
    expect(find.text('Current selection: Empty'), findsOneWidget);

    slider.onChanged?.call(4);
    await tester.pump();
    expect(find.text('Current selection: Full'), findsOneWidget);
  });

  testWidgets('debug signal updates displayed readout and noise label', (tester) async {
    double scriptedSignal(Duration elapsed) {
      return elapsed < const Duration(milliseconds: 450) ? 0.08 : 0.98;
    }

    await tester.pumpWidget(
      MaterialApp(
        home: DataCollectionScreen(
          signalSampler: scriptedSignal,
          draftRepository: repository,
        ),
      ),
    );

    expect(find.byKey(const Key('noise-label')), findsOneWidget);
    expect(
      tester.widget<Text>(find.byKey(const Key('noise-label'))).data,
      'Quiet',
    );
    final initialText = tester.widget<RichText>(find.byKey(const Key('decibel-readout')));
    final initialValue = initialText.text.toPlainText();

    // Pump many individual frames so the signal smoothing can converge
    for (int i = 0; i < 60; i++) {
      await tester.pump(const Duration(milliseconds: 16));
    }

    final updatedText = tester.widget<RichText>(find.byKey(const Key('decibel-readout')));
    final updatedValue = updatedText.text.toPlainText();

    expect(updatedValue, isNot(equals(initialValue)));
    expect(
      tester.widget<Text>(find.byKey(const Key('noise-label'))).data,
      'Loud',
    );
  });

  testWidgets('animation widget mounts and disposes cleanly', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: DataCollectionScreen(draftRepository: repository),
      ),
    );

    expect(tester.takeException(), isNull);

    await tester.pumpWidget(const MaterialApp(home: SizedBox.shrink()));
    await tester.pump();

    expect(tester.takeException(), isNull);
  });

  testWidgets('capture controls toggle start and pause states', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: DataCollectionScreen(draftRepository: repository),
      ),
    );

    expect(find.text('Ready to capture'), findsOneWidget);

    await tester.ensureVisible(find.byKey(const Key('start-capture-button')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('start-capture-button')));
    await tester.pump();

    expect(find.text('Collecting live samples'), findsOneWidget);
    expect(find.text('Capturing'), findsOneWidget);

    await tester.ensureVisible(find.byKey(const Key('pause-capture-button')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('pause-capture-button')));
    await tester.pump();

    expect(find.text('Ready to capture'), findsOneWidget);
    expect(find.text('Paused'), findsOneWidget);
  });

  testWidgets('capture history and draft review populate after saving a draft', (
    tester,
  ) async {
    double scriptedSignal(Duration elapsed) {
      final bucket = elapsed.inMilliseconds ~/ 250;
      return 0.2 + ((bucket % 5) * 0.15);
    }

    await tester.pumpWidget(
      MaterialApp(
        home: DataCollectionScreen(
          signalSampler: scriptedSignal,
          draftRepository: repository,
        ),
      ),
    );

    await tester.ensureVisible(find.byKey(const Key('start-capture-button')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('start-capture-button')));
    await tester.pump();
    // Pump individual frames at the sample interval so samples accumulate
    for (int i = 0; i < 12; i++) {
      await tester.pump(const Duration(milliseconds: 250));
    }

    final saveButton = tester.widget<FilledButton>(find.byKey(const Key('save-draft-button')));
    expect(saveButton.onPressed, isNotNull);

    await tester.ensureVisible(find.byKey(const Key('save-draft-button')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('save-draft-button')));
    await tester.pump();

    expect(find.byKey(const Key('draft-review-card')), findsOneWidget);
    expect(repository.drafts, isNotEmpty);
    expect(find.textContaining('Enough samples collected'), findsOneWidget);
  });
}
