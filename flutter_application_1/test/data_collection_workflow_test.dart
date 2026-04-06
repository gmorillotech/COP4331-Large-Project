import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_application_1/data_collection/data_collection_model.dart';
import 'package:flutter_application_1/data_collection/data_collection_workflow.dart';

void main() {
  group('data collection workflow', () {
    test(
      'session service initializes a local session from coordinates',
      () async {
        final service = SessionService(
          userRepository: const InMemorySessionUserRepository(
            users: <SessionUser>[
              SessionUser(userId: 'local-user', displayName: 'Local User'),
            ],
          ),
        );

        final sessionState = await service.initializeSession(
          'local-user',
          const SessionCoordinates(latitude: 28.6002, longitude: -81.2018),
          'pixel-1',
        );

        expect(sessionState.userId, 'local-user');
        expect(sessionState.studyLocationId, 'library-floor-1-quiet');
        expect(sessionState.deviceId, 'pixel-1');
        expect(
          service.activeStudyLocation?.studyLocationId,
          'library-floor-1-quiet',
        );
        expect(service.currentUser?.displayName, 'Local User');
        expect(service.sessionState, isNotNull);
      },
    );

    test(
      'session service builds a report from the active session window',
      () async {
        final service = SessionService();
        await service.initializeSession(
          'local-user',
          const SessionCoordinates(latitude: 28.6002, longitude: -81.2018),
        );

        for (final reading in <double>[
          45,
          46,
          47,
          50,
          49,
          48,
          47,
          46,
          45,
          44,
          43,
          90,
        ]) {
          service.getDecibelReading(reading);
        }
        service.updateOccupancy(OccupancyLevel.busy);

        final report = service.buildReport(
          createdAt: DateTime.utc(2026, 4, 3, 18, 30),
        );

        expect(report.userId, 'local-user');
        expect(report.studyLocationId, 'library-floor-1-quiet');
        expect(report.occupancy, 4);
        expect(report.sampleCount, 12);
        expect(report.avgNoise, greaterThan(40));
        expect(report.maxNoise, lessThan(90));
        expect(report.variance, greaterThan(0));
      },
    );

    test('session service advance window clears only noise samples', () async {
      final service = SessionService();
      await service.initializeSession(
        'local-user',
        const SessionCoordinates(latitude: 28.6002, longitude: -81.2018),
      );

      service.getDecibelReading(45);
      service.getDecibelReading(46);
      service.updateOccupancy(OccupancyLevel.moderate);
      service.advanceWindow();

      expect(service.sessionState?.noiseWindow, isEmpty);
      expect(service.sessionState?.occupancyLevel, OccupancyLevel.moderate);
      expect(service.sessionState?.studyLocationId, 'library-floor-1-quiet');
    });

    test('session state tracks local capture fields and updates immutably', () {
      final startedAt = DateTime.utc(2026, 4, 3, 18, 0);
      final sampledAt = DateTime.utc(2026, 4, 3, 18, 0, 30);

      final sessionState = SessionState.start(
        userId: 'local-user',
        studyLocationId: seededStudyLocations.first.studyLocationId,
        deviceId: 'pixel-1',
        startedAt: startedAt,
      );
      final updatedSession = sessionState
          .addNoiseReading(47.5, sampledAt: sampledAt)
          .updateOccupancy(OccupancyLevel.busy);

      expect(sessionState.noiseWindow, isEmpty);
      expect(updatedSession.userId, 'local-user');
      expect(
        updatedSession.studyLocationId,
        seededStudyLocations.first.studyLocationId,
      );
      expect(updatedSession.deviceId, 'pixel-1');
      expect(updatedSession.startedAt, startedAt);
      expect(updatedSession.lastSampleTime, sampledAt);
      expect(updatedSession.noiseWindow, <double>[47.5]);
      expect(updatedSession.sampleCount, 1);
      expect(updatedSession.occupancyLevel, OccupancyLevel.busy);
      expect(updatedSession.occupancyReportValue, 4);
      expect(updatedSession.elapsed, const Duration(seconds: 30));
    });

    test('session state reset clears only the local noise window', () {
      final sessionState =
          SessionState.start(
                userId: 'local-user',
                studyLocationId: seededStudyLocations.first.studyLocationId,
                startedAt: DateTime.utc(2026, 4, 3, 18, 0),
              )
              .addNoiseReading(45)
              .addNoiseReading(46)
              .updateOccupancy(OccupancyLevel.moderate);

      final resetSession = sessionState.resetWindowVariables();

      expect(resetSession.noiseWindow, isEmpty);
      expect(resetSession.occupancyLevel, OccupancyLevel.moderate);
      expect(resetSession.studyLocationId, sessionState.studyLocationId);
      expect(resetSession.userId, sessionState.userId);
    });

    test('draft builder produces A1-shaped report fields', () {
      const builder = CapturedReportDraftBuilder();
      final createdAt = DateTime.utc(2026, 3, 28, 16, 15);

      final draft = builder.build(
        location: seededStudyLocations.first,
        occupancy: OccupancyLevel.busy,
        rawSamples: const [45, 46, 47, 50, 49, 48, 47, 46, 45, 44, 43, 90],
        createdAt: createdAt,
      );

      expect(draft.studyLocationId, seededStudyLocations.first.studyLocationId);
      expect(draft.locationGroupId, seededStudyLocations.first.locationGroupId);
      expect(draft.userId, 'local-user');
      expect(draft.occupancy, 4);
      expect(draft.sampleCount, 12);
      expect(draft.avgNoise, greaterThan(40));
      expect(draft.maxNoise, lessThan(90));
      expect(draft.variance, greaterThan(0));
      expect(draft.createdAt, createdAt);
    });

    test('location resolver returns nearest seeded location', () {
      const resolver = LocalStudyLocationResolver();

      final location = resolver.resolveNearest(
        latitude: 28.6002,
        longitude: -81.2018,
      );

      expect(location, isNotNull);
      expect(location!.studyLocationId, 'library-floor-1-quiet');
    });

    test('location resolver derives padded location group boundaries', () {
      const resolver = LocalStudyLocationResolver();

      final group = resolver.findGroupById('group-john-c-hitt-library');

      expect(group, isNotNull);
      expect(group!.studyLocations, hasLength(4));
      expect(group.radiusMeters, greaterThan(40));
      expect(
        group.contains(
          const SessionCoordinates(latitude: 28.60031, longitude: -81.20175),
        ),
        isTrue,
      );
      expect(
        group.contains(
          const SessionCoordinates(latitude: 28.6035, longitude: -81.1975),
        ),
        isFalse,
      );
    });

    test('in-memory draft repository removes queued drafts by id', () async {
      final repository = InMemoryReportDraftRepository.instance;
      repository.clear();
      const builder = CapturedReportDraftBuilder();

      final draft = builder.build(
        location: seededStudyLocations.first,
        occupancy: OccupancyLevel.busy,
        rawSamples: const [45, 46, 47, 48, 49, 50, 51, 52, 53, 54],
        createdAt: DateTime.utc(2026, 3, 28, 16, 15),
      );

      await repository.saveDraft(draft);
      expect(repository.drafts, hasLength(1));

      await repository.removeDraft(draft.reportId);
      expect(repository.drafts, isEmpty);
    });
  });
}
