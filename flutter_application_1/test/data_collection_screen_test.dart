import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_application_1/data_collection/background_collection_controller.dart';
import 'package:flutter_application_1/data_collection/data_collection_backend.dart';
import 'package:flutter_application_1/data_collection/data_collection_model.dart';
import 'package:flutter_application_1/data_collection/data_collection_screen.dart';
import 'package:flutter_application_1/data_collection/data_collection_workflow.dart';
import 'package:permission_handler/permission_handler.dart';

class FakeBackendClient implements DataCollectionBackendClient {
  FakeBackendClient({
    this.failSubmission = false,
    List<DataCollectionStudyLocation> locations = seededStudyLocations,
  }) : locations = List<DataCollectionStudyLocation>.from(locations);

  final bool failSubmission;
  List<DataCollectionStudyLocation> locations;
  final List<CapturedReportDraft> submittedReports = <CapturedReportDraft>[];
  final List<DataCollectionLocationGroup> createdGroups =
      <DataCollectionLocationGroup>[];

  @override
  Future<List<DataCollectionStudyLocation>> fetchStudyLocations() async {
    return locations;
  }

  @override
  Future<void> submitReport(CapturedReportDraft draft) async {
    if (failSubmission) {
      throw Exception('backend unavailable');
    }

    submittedReports.add(draft);
  }

  @override
  Future<DataCollectionLocationGroup> createLocationGroup({
    required String name,
    required double centerLatitude,
    required double centerLongitude,
    required double creatorLatitude,
    required double creatorLongitude,
  }) async {
    const apothemMeters = 60.0;
    final circumradiusMeters = apothemMeters / 0.8660254037844386;
    final metersPerDegreeLat = 111320.0;
    final metersPerDegreeLng =
        metersPerDegreeLat * math.cos(centerLatitude * math.pi / 180);
    final vertices = List<DataCollectionGroupVertex>.generate(6, (index) {
      final angleRadians = (-90 + (index * 60)) * math.pi / 180;
      return DataCollectionGroupVertex(
        latitude:
            centerLatitude +
            (math.sin(angleRadians) * circumradiusMeters) /
                metersPerDegreeLat,
        longitude:
            centerLongitude +
            (math.cos(angleRadians) * circumradiusMeters) /
                metersPerDegreeLng,
      );
    });
    final group = DataCollectionLocationGroup(
      locationGroupId:
          'group-${name.replaceAll(RegExp(r'[^a-zA-Z0-9]+'), '-').toLowerCase()}',
      buildingName: name,
      centerLatitude: centerLatitude,
      centerLongitude: centerLongitude,
      radiusMeters: apothemMeters,
      studyLocations: const <DataCollectionStudyLocation>[],
      polygon: <DataCollectionGroupVertex>[...vertices, vertices.first],
      hasExplicitBoundary: true,
    );
    createdGroups.add(group);
    return group;
  }

  @override
  Future<DataCollectionStudyLocation> createStudyLocation({
    required String locationGroupId,
    required String name,
    String floorLabel = '',
    String sublocationLabel = '',
    required double latitude,
    required double longitude,
  }) async {
    final groupBuildingName = locations
        .where((location) => location.locationGroupId == locationGroupId)
        .map((location) => location.buildingName)
        .cast<String?>()
        .firstWhere(
          (buildingName) => buildingName != null && buildingName.isNotEmpty,
          orElse: () => createdGroups
              .where((group) => group.locationGroupId == locationGroupId)
              .map((group) => group.buildingName)
              .cast<String?>()
              .firstWhere(
                (buildingName) =>
                    buildingName != null && buildingName.isNotEmpty,
                orElse: () => 'Study Location Group',
              ),
        )!;

    final created = DataCollectionStudyLocation(
      studyLocationId:
          '${locationGroupId.replaceAll(RegExp(r'[^a-zA-Z0-9]+'), '-')}-${name.replaceAll(RegExp(r'[^a-zA-Z0-9]+'), '-').toLowerCase()}',
      locationGroupId: locationGroupId,
      locationName: name,
      buildingName: groupBuildingName,
      floorLabel: floorLabel,
      sublocationLabel: sublocationLabel,
      latitude: latitude,
      longitude: longitude,
      groupCenterLatitude: createdGroups
          .where((group) => group.locationGroupId == locationGroupId)
          .map((group) => group.centerLatitude)
          .cast<double?>()
          .firstWhere((value) => value != null, orElse: () => null),
      groupCenterLongitude: createdGroups
          .where((group) => group.locationGroupId == locationGroupId)
          .map((group) => group.centerLongitude)
          .cast<double?>()
          .firstWhere((value) => value != null, orElse: () => null),
      groupRadiusMeters: createdGroups
          .where((group) => group.locationGroupId == locationGroupId)
          .map((group) => group.radiusMeters)
          .cast<double?>()
          .firstWhere((value) => value != null, orElse: () => null),
      groupPolygon: createdGroups
          .where((group) => group.locationGroupId == locationGroupId)
          .map((group) => group.polygon)
          .cast<List<DataCollectionGroupVertex>?>()
          .firstWhere((value) => value != null, orElse: () => null) ??
          const <DataCollectionGroupVertex>[],
    );
    locations = <DataCollectionStudyLocation>[...locations, created];
    return created;
  }
}

class FakeBackgroundCollectionController
    implements BackgroundCollectionController {
  FakeBackgroundCollectionController({this.supported = true});

  final bool supported;
  bool isActive = false;
  String? lastNotificationTitle;
  String? lastNotificationText;

  @override
  bool get isSupported => supported;

  @override
  Future<bool> isSessionActive() async => isActive;

  @override
  Future<void> startSession({
    required String notificationTitle,
    required String notificationText,
  }) async {
    isActive = true;
    lastNotificationTitle = notificationTitle;
    lastNotificationText = notificationText;
  }

  @override
  Future<void> stopSession() async {
    isActive = false;
  }
}

Future<PermissionStatus> grantedMicrophonePermission() async {
  return PermissionStatus.granted;
}

Future<PermissionStatus> deniedMicrophonePermission() async {
  return PermissionStatus.denied;
}

Future<PermissionStatus> grantedLocationPermission() async {
  return PermissionStatus.granted;
}

Future<PermissionStatus> grantedBackgroundLocationPermission() async {
  return PermissionStatus.granted;
}

Future<PermissionStatus> deniedBackgroundLocationPermission() async {
  return PermissionStatus.denied;
}

Future<PermissionStatus> deniedLocationPermission() async {
  return PermissionStatus.denied;
}

Future<SessionCoordinates?> libraryCoordinatesProvider() async {
  return const SessionCoordinates(latitude: 28.60024, longitude: -81.20182);
}

Stream<SessionCoordinates> emptyCoordinatesStream() {
  return const Stream<SessionCoordinates>.empty();
}

Future<void> scrollToAndTap(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(
    finder,
    200,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.pump();
  await tester.tap(finder, warnIfMissed: false);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 10));
}

Future<void> waitForLocationLockReady(WidgetTester tester) async {
  for (int i = 0; i < 20; i++) {
    await tester.pump(const Duration(milliseconds: 50));
    if (find.textContaining('Currently inside').evaluate().isNotEmpty) {
      return;
    }
  }
}

Widget buildScreen({
  SignalSampler signalSampler = demoSignalLevel,
  ReportDraftRepository? draftRepository,
  DataCollectionBackendClient? backendClient,
  MicrophonePermissionRequest microphonePermissionRequest =
      grantedMicrophonePermission,
  LocationPermissionRequest locationPermissionRequest =
      grantedLocationPermission,
  BackgroundLocationPermissionRequest backgroundLocationPermissionRequest =
      grantedBackgroundLocationPermission,
  BackgroundLocationPermissionStatusProvider
      backgroundLocationPermissionStatusProvider =
      grantedBackgroundLocationPermission,
  CurrentSessionCoordinatesProvider currentCoordinatesProvider =
      libraryCoordinatesProvider,
  SessionCoordinatesStreamFactory coordinatesStreamFactory =
      emptyCoordinatesStream,
  BackgroundCollectionController? backgroundCollectionController,
}) {
  return MaterialApp(
    home: DataCollectionScreen(
      signalSampler: signalSampler,
      draftRepository: draftRepository,
      backendClient: backendClient,
      microphonePermissionRequest: microphonePermissionRequest,
      locationPermissionRequest: locationPermissionRequest,
      backgroundLocationPermissionRequest: backgroundLocationPermissionRequest,
      backgroundLocationPermissionStatusProvider:
          backgroundLocationPermissionStatusProvider,
      currentCoordinatesProvider: currentCoordinatesProvider,
      coordinatesStreamFactory: coordinatesStreamFactory,
      backgroundCollectionController:
          backgroundCollectionController ??
          FakeBackgroundCollectionController(supported: false),
      allowSyntheticAudioInput: true,
    ),
  );
}

void main() {
  late InMemoryReportDraftRepository repository;
  late FakeBackendClient backendClient;
  late FakeBackgroundCollectionController backgroundController;

  setUp(() {
    repository = InMemoryReportDraftRepository.instance;
    repository.clear();
    backendClient = FakeBackendClient();
    backgroundController = FakeBackgroundCollectionController();
  });

  testWidgets('data collection screen renders core controls', (tester) async {
    await tester.pumpWidget(
      buildScreen(draftRepository: repository, backendClient: backendClient),
    );

    expect(find.byKey(const Key('data-collection-screen')), findsOneWidget);
    expect(find.byKey(const Key('decibel-readout')), findsOneWidget);
    expect(find.byKey(const Key('noise-bar')), findsOneWidget);
    expect(find.byKey(const Key('occupancy-slider')), findsOneWidget);
    expect(find.byKey(const Key('stable-mic')), findsOneWidget);
    expect(find.byKey(const Key('location-dropdown')), findsOneWidget);
    expect(find.byKey(const Key('start-capture-button')), findsOneWidget);
    expect(find.byKey(const Key('stop-capture-button')), findsOneWidget);
    expect(find.byKey(const Key('signal-history-chart')), findsOneWidget);
    expect(find.byKey(const Key('capture-progress-bar')), findsOneWidget);
    expect(find.byKey(const Key('privacy-statements-card')), findsOneWidget);
    expect(find.text('A1 INPUT PREP'), findsNothing);
  });

  testWidgets('android background mode card reflects active capture state', (
    tester,
  ) async {
    await tester.pumpWidget(
      buildScreen(
        draftRepository: repository,
        backendClient: backendClient,
        backgroundCollectionController: backgroundController,
      ),
    );
    await waitForLocationLockReady(tester);

    expect(
      find.byKey(const Key('android-background-mode-card')),
      findsOneWidget,
    );
    expect(find.text('ANDROID BACKGROUND MODE: READY'), findsOneWidget);

    await scrollToAndTap(tester, find.byKey(const Key('start-capture-button')));
    await tester.pump();

    expect(find.text('ANDROID BACKGROUND MODE: ACTIVE'), findsOneWidget);
    expect(backgroundController.isActive, isTrue);
    expect(
      backgroundController.lastNotificationText,
      contains('Collecting microphone and location samples'),
    );
  });

  testWidgets('occupancy slider exposes exactly five levels', (tester) async {
    await tester.pumpWidget(
      buildScreen(draftRepository: repository, backendClient: backendClient),
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

  testWidgets('debug signal updates displayed readout and noise label', (
    tester,
  ) async {
    double scriptedSignal(Duration elapsed) {
      return elapsed < const Duration(milliseconds: 450) ? 0.08 : 0.98;
    }

    await tester.pumpWidget(
      buildScreen(
        signalSampler: scriptedSignal,
        draftRepository: repository,
        backendClient: backendClient,
      ),
    );
    await tester.pump();

    expect(find.byKey(const Key('microphone-permission-gate')), findsNothing);
    expect(find.byKey(const Key('noise-label')), findsOneWidget);
    expect(
      tester.widget<Text>(find.byKey(const Key('noise-label'))).data,
      'Quiet',
    );
    final initialText = tester.widget<RichText>(
      find.byKey(const Key('decibel-readout')),
    );
    final initialValue = initialText.text.toPlainText();

    // Pump many individual frames so the signal smoothing can converge
    for (int i = 0; i < 60; i++) {
      await tester.pump(const Duration(milliseconds: 16));
    }

    final updatedText = tester.widget<RichText>(
      find.byKey(const Key('decibel-readout')),
    );
    final updatedValue = updatedText.text.toPlainText();

    expect(updatedValue, isNot(equals(initialValue)));
    expect(
      tester.widget<Text>(find.byKey(const Key('noise-label'))).data,
      'Loud',
    );
  });

  testWidgets('screen is gated when microphone permission is denied', (
    tester,
  ) async {
    await tester.pumpWidget(
      buildScreen(
        draftRepository: repository,
        backendClient: backendClient,
        microphonePermissionRequest: deniedMicrophonePermission,
      ),
    );
    await tester.pump();

    expect(find.byKey(const Key('microphone-permission-gate')), findsOneWidget);
    expect(find.text('Microphone permission required'), findsOneWidget);

    final startButton = tester.widget<FilledButton>(
      find.byKey(const Key('start-capture-button')),
    );
    expect(startButton.onPressed, isNull);
    expect(find.text('Microphone access required'), findsOneWidget);
    expect(find.byKey(const Key('microphone-permission-gate')), findsOneWidget);
  });

  testWidgets('animation widget mounts and disposes cleanly', (tester) async {
    await tester.pumpWidget(
      buildScreen(draftRepository: repository, backendClient: backendClient),
    );

    expect(tester.takeException(), isNull);

    await tester.pumpWidget(const MaterialApp(home: SizedBox.shrink()));
    await tester.pump();

    expect(tester.takeException(), isNull);
  });

  testWidgets('capture controls toggle start and stop states', (tester) async {
    await tester.pumpWidget(
      buildScreen(draftRepository: repository, backendClient: backendClient),
    );
    await waitForLocationLockReady(tester);

    expect(find.text('Ready to capture'), findsOneWidget);
    expect(
      find.textContaining('Currently inside John C. Hitt Library'),
      findsOneWidget,
    );

    await scrollToAndTap(tester, find.byKey(const Key('start-capture-button')));

    expect(find.text('Collecting live samples'), findsOneWidget);
    expect(find.text('Capturing'), findsOneWidget);
    expect(
      find.textContaining('Session locked to John C. Hitt Library'),
      findsOneWidget,
    );

    await scrollToAndTap(tester, find.byKey(const Key('stop-capture-button')));

    expect(find.text('Ready to capture'), findsOneWidget);
    expect(find.text('Stopped'), findsOneWidget);
    expect(
      find.textContaining('Currently inside John C. Hitt Library'),
      findsOneWidget,
    );
  });

  testWidgets(
    'location choices are limited to the detected group before capture starts',
    (tester) async {
      await tester.pumpWidget(
        buildScreen(draftRepository: repository, backendClient: backendClient),
      );
      await waitForLocationLockReady(tester);

      expect(
        find.textContaining(
          'Currently inside John C. Hitt Library. Choose one of 4 study areas before recording.',
        ),
        findsOneWidget,
      );
      expect(find.text('Floor 1, North Reading Room'), findsOneWidget);
      expect(
        find.text(
          'This studyLocationId is sent directly with each backend report submission.',
        ),
        findsOneWidget,
      );
    },
  );

  testWidgets('leaving the locked location group cuts off the active session', (
    tester,
  ) async {
    final coordinatesController =
        StreamController<SessionCoordinates>.broadcast();
    addTearDown(coordinatesController.close);

    await tester.pumpWidget(
      buildScreen(
        draftRepository: repository,
        backendClient: backendClient,
        coordinatesStreamFactory: () => coordinatesController.stream,
      ),
    );
    await waitForLocationLockReady(tester);

    await scrollToAndTap(tester, find.byKey(const Key('start-capture-button')));

    coordinatesController.add(
      const SessionCoordinates(latitude: 28.60192, longitude: -81.19994),
    );
    await tester.pump();

    expect(find.text('Stopped'), findsOneWidget);
    expect(
      find.textContaining(
        'Recording stopped because you left the John C. Hitt Library',
      ),
      findsOneWidget,
    );

    expect(
      find.textContaining('Currently inside Student Union'),
      findsOneWidget,
    );
  });

  testWidgets('location card shows live app coordinates as they change', (
    tester,
  ) async {
    final coordinatesController =
        StreamController<SessionCoordinates>.broadcast();
    addTearDown(coordinatesController.close);

    await tester.pumpWidget(
      buildScreen(
        draftRepository: repository,
        backendClient: backendClient,
        coordinatesStreamFactory: () => coordinatesController.stream,
      ),
    );
    await waitForLocationLockReady(tester);

    expect(find.text('28.6002, -81.2018'), findsOneWidget);

    coordinatesController.add(
      const SessionCoordinates(latitude: 28.60192, longitude: -81.19994),
    );
    await tester.pump();

    expect(find.text('28.6019, -81.1999'), findsOneWidget);
  });

  testWidgets('screen explains when location permission is denied', (
    tester,
  ) async {
    await tester.pumpWidget(
      buildScreen(
        draftRepository: repository,
        backendClient: backendClient,
        locationPermissionRequest: deniedLocationPermission,
      ),
    );
    await tester.pump();

    expect(
      find.textContaining(
        'Location access is required to lock a recording session',
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('retry-location-permission-button')),
      findsOneWidget,
    );
  });

  testWidgets('15-second auto window submits to backend when available', (
    tester,
  ) async {
    double scriptedSignal(Duration elapsed) {
      final bucket = elapsed.inMilliseconds ~/ 250;
      return 0.2 + ((bucket % 5) * 0.15);
    }

    await tester.pumpWidget(
      buildScreen(
        signalSampler: scriptedSignal,
        draftRepository: repository,
        backendClient: backendClient,
      ),
    );
    await waitForLocationLockReady(tester);

    await scrollToAndTap(tester, find.byKey(const Key('start-capture-button')));
    for (int i = 0; i < 60; i++) {
      await tester.pump(const Duration(milliseconds: 250));
    }
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.byKey(const Key('draft-review-card')), findsOneWidget);
    expect(repository.drafts, isEmpty);
    expect(backendClient.submittedReports, isNotEmpty);
    expect(
      find.textContaining('Uploaded queued report to backend'),
      findsOneWidget,
    );
  });

  testWidgets('stop ends the active session without needing a pause button', (
    tester,
  ) async {
    double scriptedSignal(Duration elapsed) {
      final bucket = elapsed.inMilliseconds ~/ 250;
      return 0.2 + ((bucket % 5) * 0.15);
    }

    await tester.pumpWidget(
      buildScreen(
        signalSampler: scriptedSignal,
        draftRepository: repository,
        backendClient: backendClient,
      ),
    );
    await waitForLocationLockReady(tester);

    await scrollToAndTap(tester, find.byKey(const Key('start-capture-button')));

    await scrollToAndTap(tester, find.byKey(const Key('stop-capture-button')));

    expect(find.text('Ready to capture'), findsOneWidget);
    expect(find.text('Stopped'), findsOneWidget);
    expect(find.byKey(const Key('pause-capture-button')), findsNothing);
    expect(find.byKey(const Key('save-draft-button')), findsNothing);
  });

  testWidgets('failed automatic submission queues the report in memory', (
    tester,
  ) async {
    backendClient = FakeBackendClient(failSubmission: true);

    double scriptedSignal(Duration elapsed) {
      final bucket = elapsed.inMilliseconds ~/ 250;
      return 0.25 + ((bucket % 4) * 0.14);
    }

    await tester.pumpWidget(
      buildScreen(
        signalSampler: scriptedSignal,
        draftRepository: repository,
        backendClient: backendClient,
      ),
    );
    await waitForLocationLockReady(tester);

    await scrollToAndTap(tester, find.byKey(const Key('start-capture-button')));

    for (int i = 0; i < 60; i++) {
      await tester.pump(const Duration(milliseconds: 250));
    }
    await tester.pump();

    expect(repository.drafts, isNotEmpty);
    expect(backendClient.submittedReports, isEmpty);
    expect(find.byKey(const Key('draft-review-card')), findsOneWidget);
    expect(
      find.textContaining('Queued a 15-second report window'),
      findsOneWidget,
    );
  });

  testWidgets(
    '15-second auto window queues the report in memory when backend is unavailable',
    (tester) async {
      backendClient = FakeBackendClient(failSubmission: true);

      double scriptedSignal(Duration elapsed) {
        final bucket = elapsed.inMilliseconds ~/ 250;
        return 0.25 + ((bucket % 4) * 0.14);
      }

      await tester.pumpWidget(
        buildScreen(
          signalSampler: scriptedSignal,
          draftRepository: repository,
          backendClient: backendClient,
        ),
      );
      await waitForLocationLockReady(tester);

      await scrollToAndTap(
        tester,
        find.byKey(const Key('start-capture-button')),
      );

      for (int i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 250));
      }

      expect(repository.drafts, isNotEmpty);
      expect(backendClient.submittedReports, isEmpty);
      expect(find.byKey(const Key('draft-review-card')), findsOneWidget);
      expect(
        find.textContaining('Queued a 15-second report window'),
        findsOneWidget,
      );
    },
  );
}
