import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_application_1/data_collection/data_collection_model.dart';
import 'package:flutter_application_1/data_collection/data_collection_workflow.dart';

void main() {
  group('data collection workflow', () {
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
