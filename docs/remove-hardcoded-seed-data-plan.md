# Remove Hardcoded Seed Data — Implementation Plan

Remove the hardcoded fallback study-location records for John C. Hitt Library,
Mathematical Sciences Building, and Student Union from the Flutter app.

> **Note:** Skip any Flutter CLI commands (`flutter analyze`, `flutter test`,
> `flutter pub get`, `flutter run`, etc.). Do not execute them as part of this
> plan — code edits only.

## Background

`docs/project-memory-index.md` notes that the Flutter app "includes
seeded/fallback map records in code." That seed data lives in one file and is
only consumed by a single fallback path that runs when the search API call
fails.

## Target File

`flutter_application_1/lib/main.dart`

## Steps

### 1. Delete the seed constant

Remove `const List<LocationRecord> _seededRecords` at
`flutter_application_1/lib/main.dart:94-192` (the 6 `LocationRecord` entries
across library / MSB / Student Union).

### 2. Delete the fallback builder

Remove the `_fallbackNodes()` method at
`flutter_application_1/lib/main.dart:905-1008`. It is the only consumer of
`_seededRecords`.

### 3. Update the API failure path

At `flutter_application_1/lib/main.dart:879-884`, the search `catch` block
currently calls `_fallbackNodes()` and sets a status that mentions "seeded map
data". Replace it so it applies an empty result set and a status that no longer
references seed data, e.g.:

```dart
_applyRecords(
  const [],
  status: 'API unavailable at $_baseUrl.',
);
```

### 4. Remove now-unused helpers

These are only referenced by `_fallbackNodes()`:

- `_groupId` at `flutter_application_1/lib/main.dart:2302`
- `_fallbackNoiseBand` at `flutter_application_1/lib/main.dart:2367`

Keep `_badgeForFloor` (`main.dart:2304`) — it is still used at `main.dart:356`.

### 5. Evaluate `LocationRecord`

Grep `LocationRecord` across `flutter_application_1/lib/`. If removing
`_seededRecords` and `_fallbackNodes()` leaves no remaining references, delete
the `LocationRecord` class and its `fromJson` factory as well. Otherwise leave
it in place.

### 6. Update Flutter tests

Check `flutter_application_1/test/` for fixtures or assertions tied to the
removed seed. Likely candidates based on file names:

- `test/map_search_viewport_test.dart`
- `test/data_collection_workflow_test.dart`
- `test/data_collection_screen_test.dart`

Update or remove any test data that references the three buildings as seeded
fallbacks. Test-only fixtures that mention these building names for other
reasons (e.g. data-collection payload shape) can stay.

## Out of Scope

The following references to the three building names are **not** runtime seed
data and should be left alone unless the user asks to scrub them too:

- `server/tests/locationRoutes.integration.test.js` — backend integration test
  fixtures
- `server/tests/adminSearchRoutes.integration.test.js` — admin search test
  fixtures
- `server/services/locationCatalog.js` — backend catalog data (separate
  decision)
- `Web_Frontend/src/types/mapAnnotations.ts` — doc comment example only

## Verification

Because Flutter CLI commands are skipped per the note above, verification is
limited to:

- Visual inspection that `_seededRecords`, `_fallbackNodes()`, and the removed
  helpers no longer appear in `main.dart`.
- Confirming the `catch` block in the search flow no longer references seed
  data.
- Confirming no remaining import or reference to `LocationRecord` if that class
  was removed.

Running `flutter analyze` / `flutter test` to confirm compilation and test
health is deferred to whoever picks the work up outside this plan.
