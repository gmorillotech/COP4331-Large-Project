# Admin Mode Specification

Status: Draft

Project: COP4331 Large Project / Decibel Tracker / SpotStudy

## 1. Summary

Admin mode is a separate application experience for privileged users. It does not expose the regular end-user workflow such as report submission, favorites, or the standard account center. Instead, it provides operational tools for:

- searching `LocationGroup` and `StudyLocation` records on a map,
- viewing and deleting active reports,
- editing location groups, including merging groups,
- redrawing group boundaries as polygons, and
- managing user accounts.

This spec is written against the current codebase, which already has `LocationGroup`, `StudyLocation`, `Report`, and `User` models, a map-based web search UI, JWT auth, password reset, and email verification.

## 2. Goals

- Give admins a fast map-first way to inspect live reporting activity by group or study location.
- Let admins delete bad or abusive live reports manually.
- Let admins restructure location groups without direct database edits.
- Replace circle-only group boundaries with editable polygon boundaries.
- Let admins manage core user account and trust controls from one page.

## 3. Non-Goals

- Admin mode does not include normal user report submission or personal profile editing.
- This phase does not redesign the end-user map experience.
- This phase does not add bulk import/export tooling.
- This phase does not edit archived summary reports.

## 4. Current-State Constraints

The current implementation has several gaps that admin mode must address explicitly:

- `User` has no admin role field today.
- The existing trust-related field that should back the admin-facing trust score is `userOccupancyWF`.
- `userNoiseWF` already exists in the codebase, but it should remain an internal processing field rather than a user-facing setting.
- `LocationGroup` currently supports circle boundaries only via `centerLatitude`, `centerLongitude`, and `radiusMeters`.
- `Report` distinguishes `live` vs `archive_summary`, but there is no explicit stale threshold field or admin delete endpoint.

## 5. Definitions

- `LocationGroup`: a parent grouping for one or more `StudyLocation` records.
- `StudyLocation`: a specific place that receives reports.
- `Active report`: a `Report` with `reportKind = "live"` whose `createdAt` is within the configured stale window.
- `Stale report`: a `live` report older than the configured stale window. Stale reports are not shown in the admin "active reports" view.
- `Admin mode`: a separate UI and API surface available only to admins.

## 6. Roles and Access Control

### 6.1 User Model Changes

Add the following fields to `User`:

- `role`: enum, at minimum `user | admin`, default `user`.
- `accountStatus`: enum, at minimum `active | forced_reset | suspended`, default `active`.

Implementation note:

- `userOccupancyWF` is the admin-facing trust score for phase 1.
- `userNoiseWF` remains an existing internal field and should not be exposed as a normal user-editable setting.
- Admin mode should not introduce a separate `trustScore` column in phase 1.

### 6.2 Authorization

- All admin UI routes require a valid JWT for a user with `role = admin`.
- All admin API routes must use `protect` plus a new `requireAdmin` middleware.
- Non-admin access returns `403 Forbidden`.

### 6.3 Routing

- Add a dedicated web route namespace such as `/admin`.
- Admin mode should have its own shell and navigation, separate from the normal `/home` flow.
- Direct navigation to admin URLs by a non-admin user should redirect to login or show forbidden state.

## 7. Information Architecture

Admin mode contains these pages/modes:

- `Admin Search` page: default landing page, map-based.
- `Location Edit` mode: map-based, used for selecting and merging two groups.
- `Redraw Group` mode: map-based polygon editor for a single group.
- `Manage Users` page: table/list-based, not map-based.

## 8. Functional Requirements

### 8.1 Admin Search Page

The default admin page is a map-plus-list search experience derived from the existing map search UI, but focused on operations instead of end-user discovery.

Requirements:

- Show both `LocationGroup` and `StudyLocation` results.
- Support search by group name, study location name, floor label, and sublocation label.
- Allow selecting a result either from the list or by clicking its pin on the map.
- When a `LocationGroup` is selected:
  - show group metadata,
  - show the group's child `StudyLocation` records,
  - show active reports across all child study locations,
  - allow searching within those active reports,
  - allow manual deletion of one or more selected active reports.
- When a `StudyLocation` is selected:
  - show study location metadata,
  - show only active reports for that study location,
  - allow searching within those active reports,
  - allow manual deletion of one or more selected active reports.

Report list fields:

- `reportId`
- `studyLocationId`
- location display name
- `userId`
- reporter display name when resolvable
- `createdAt`
- `avgNoise`
- `maxNoise`
- `variance`
- `occupancy`

Report search/filter behavior:

- search by `reportId`, `userId`, reporter display name, or study location name,
- newest first by default,
- optional filters for date/time window and occupancy/noise bounds may be added later but are not required for phase 1.

Delete behavior:

- Each delete action requires confirmation.
- Deleting a report deletes the `Report` row and its paired `ReportTagMetadata` row if present.
- After deletion, the backend must recompute the affected study location and group live values so map summaries stay correct.
- Deletion should be logged in an admin audit log.

### 8.2 Active vs Stale Reports

Define active-report visibility explicitly:

- A report is active when:
  - `reportKind = "live"`, and
  - `createdAt >= now - REPORT_STALE_MINUTES`.
- `REPORT_STALE_MINUTES` is a new server configuration value.
- Default `REPORT_STALE_MINUTES = 15`.

Stale reports:

- are excluded from the admin active-reports panel,
- are not shown as current activity for a group or location,
- may remain stored until normal cleanup/polling logic handles them.

### 8.3 Location Edit Mode

Location Edit mode is used to select exactly two `LocationGroup` records and merge them.

Selection behavior:

- Admin can select groups from the list or by clicking group pins on the map.
- Exactly two groups must be selected before merge actions become enabled.
- Selected groups must be visually highlighted on the map and in the list.

Merge dialog requirements:

- Show the two source group names and ids.
- Provide three naming options:
  - enter a brand-new name,
  - inherit the first group's current name,
  - inherit the second group's current name.
- Prevent empty names.

Merge result requirements:

- Create one destination `LocationGroup`.
- Reassign every `StudyLocation` from both source groups to the destination group's `locationGroupId`.
- The source groups cease to exist after successful finalization of the merge.
- All reports remain attached to their current `StudyLocation`; no report ids change.
- The merged group inherits all child study locations from both groups.
- The merged group gets recalculated current noise/occupancy values based on its child study locations.

Boundary handling for merge:

- Because admin mode will support polygon group boundaries, merge finalization requires a valid non-overlapping destination boundary.
- The system should generate a provisional merged boundary automatically using the smallest valid enclosing polygon it can derive from the two source groups and child study locations.
- If the provisional boundary would overlap another group or cannot be generated safely, the merge should create a draft destination group and immediately route the admin into Redraw Group mode before finalizing source-group deletion.
- Source groups should only be deleted once the destination group has a valid saved boundary.

### 8.4 Redraw Group Mode

Redraw Group mode lets an admin redefine a single group's boundary as an enclosed polygon.

Entry points:

- choose a group from a searchable list, or
- click a group pin on the map, then choose `Redraw group`.

Editor requirements:

- show the current group boundary overlay,
- show all child `StudyLocation` markers for the selected group,
- allow adding, moving, and removing polygon vertices,
- allow canceling edits before save,
- allow saving only when the polygon is valid.

Polygon rules:

- A group boundary may be a polygon instead of a circle.
- The polygon must be closed and contain at least 3 vertices.
- The polygon must not self-intersect.
- Group polygons must not overlap other group polygons.
- Every child `StudyLocation` in the group must be contained within the saved polygon.

Compatibility behavior:

- Existing circle-only groups must still render.
- Admin redraw converts a group from circle representation to polygon representation.
- The frontend must render both legacy circles and new polygons during migration.

### 8.5 Manage Users Page

Manage Users is a non-map admin page for account operations.

User list requirements:

- Show each user's:
  - `displayName` if present, otherwise fallback name/login,
  - `email`,
  - `userId`,
  - trust score, backed by `userOccupancyWF`,
  - `role`,
  - `accountStatus`,
  - `emailVerifiedAt`,
  - `createdAt`.

Supported actions:

- force password reset,
- edit email,
- delete account,
- manually adjust trust score.

Force password reset behavior:

- Immediately invalidate all active sessions for that user.
- Mark the user as requiring reverification and password reset.
- Send a new verification email to the current email address.
- After the user verifies the email, require them to complete password reset before normal login succeeds.

Recommended backend implementation:

- set `emailVerifiedAt = null`,
- issue a new `emailVerificationToken`,
- set `accountStatus = "forced_reset"`,
- set `passwordChangedAt = now` to invalidate existing JWTs,
- create a fresh reset token after verification or as part of the forced-reset flow.

Edit email behavior:

- Admin can update the user's email address.
- Email must remain unique.
- Changing email clears existing verification state and issues a fresh verification token.
- Optionally pair email change with forced reset in the same action when desired.

Delete account behavior:

- Requires a strong confirmation step.
- Delete the `User` record.
- Remove or anonymize any live reports that still reference that user so no broken live-user reference remains.
- Archived summaries are unaffected because they are already anonymous.
- Deletion should be logged in an admin audit log.

Trust-score adjustment behavior:

- Admin can edit `userOccupancyWF` directly.
- The UI should label this value as the user's trust score.
- `userNoiseWF` is not editable from admin mode in phase 1.
- `userOccupancyWF` should remain within the same allowed numeric range already used by report processing.
- Changes take effect for future report processing cycles.

## 9. Data Model Changes

### 9.1 `User`

Add:

- `role`
- `accountStatus`

Recommended indexes:

- `role`
- `accountStatus`

### 9.2 `LocationGroup`

Retain existing circle fields for backwards compatibility:

- `centerLatitude`
- `centerLongitude`
- `radiusMeters`

Add polygon support:

- `shapeType`: enum `circle | polygon`, default `circle`
- `polygon`: array of vertices, each with `latitude` and `longitude`
- `shapeUpdatedAt`

Rules:

- `shapeType = circle` uses existing center/radius fields.
- `shapeType = polygon` uses `polygon` and ignores circle geometry for validation/rendering.

### 9.3 Audit Log

Add an admin audit log collection for destructive or security-sensitive actions.

Minimum fields:

- `auditId`
- `adminUserId`
- `actionType`
- `targetType`
- `targetId`
- `beforeSnapshot`
- `afterSnapshot`
- `createdAt`

Logged actions:

- report deletion
- group merge
- group redraw
- user email edit
- forced password reset
- user deletion
- trust-score adjustment

## 10. API Requirements

Add a new admin route namespace such as `/api/admin`.

Suggested endpoints:

- `GET /api/admin/search`
  - search groups and study locations for admin mode
- `GET /api/admin/reports/active`
  - query active reports by `groupId`, `locationId`, search term, and pagination
- `DELETE /api/admin/reports/:reportId`
  - delete a live report and associated metadata
- `POST /api/admin/location-groups/merge`
  - create a merged group from exactly two source groups
- `PUT /api/admin/location-groups/:groupId/shape`
  - save circle or polygon shape for one group
- `GET /api/admin/users`
  - list users for management
- `PATCH /api/admin/users/:userId`
  - update email, `userOccupancyWF`, role, or account status where allowed
- `POST /api/admin/users/:userId/force-password-reset`
  - trigger forced reverification/reset
- `DELETE /api/admin/users/:userId`
  - delete account

Endpoint requirements:

- All admin endpoints require admin authorization.
- Destructive endpoints must return enough data for the UI to refresh without a full reload where practical.

## 11. Validation Rules

- Group polygons may not overlap.
- Saved group polygons must contain all assigned child study locations.
- Merge requires exactly two distinct groups.
- Source and destination group ids may not be reused.
- User email edits must preserve uniqueness.
- `userOccupancyWF` must stay within allowed numeric bounds.
- Forced password reset must invalidate old JWTs immediately.

## 12. UX Requirements

- Admin mode should feel clearly separate from the normal user experience.
- The default landing page is `Admin Search`, not the end-user map home.
- Destructive actions must use clear confirmation language.
- Merge and redraw flows should visibly show affected groups on the map before save.
- Report and user management screens should support quick search because admin tasks are operational.

## 13. Migration and Backward Compatibility

- Existing groups without polygon data remain valid circles.
- Existing APIs used by normal user flows should continue to work during migration.
- The admin UI must tolerate mixed geometry while old groups are being converted.
- Existing users get defaults:
  - `role = user`
  - `accountStatus = active`

## 14. Acceptance Criteria

- An admin can open `/admin`, search for a group or study location, and see active non-stale reports.
- An admin can delete a live report and see the affected location/group values refresh.
- An admin can select exactly two groups and complete a merge into one destination group.
- An admin can redraw a group's boundary as a polygon and save only when it is valid and non-overlapping.
- An admin can open Manage Users, see each user's display name and trust score backed by `userOccupancyWF`, edit email, force password reset, delete an account, and adjust that trust score.
- A non-admin cannot access admin pages or admin API routes.

## 15. Open Design Decisions

These items should be confirmed before implementation begins:

- Whether admin-facing copy should display the underlying field name `userOccupancyWF` anywhere, or always present it only as "trust score."
- Whether account deletion should hard-delete all live reports from that user or anonymize them instead.
- Whether merge should always require an immediate redraw confirmation when the provisional boundary is auto-generated.
- Whether admins may edit user roles in phase 1, or whether role assignment stays database-only for now.
