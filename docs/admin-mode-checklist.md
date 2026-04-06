# Admin Mode Implementation Checklist

Source: `docs/admin-mode-spec.md`

This checklist turns the admin mode spec into an implementation task board. It is organized by dependency order so the team can start with shared foundations, then split into parallel workstreams, and finish with integration and QA.

## Open Decisions To Confirm First

- [ ] Decide whether admin UI copy should always say "trust score" and never expose `userOccupancyWF` directly.
- [ ] Decide whether deleting a user should hard-delete their live reports or anonymize them.
- [ ] Decide whether auto-generated merge boundaries must always go through an explicit redraw confirmation step.
- [ ] Decide whether admins can edit user roles in phase 1 or whether role assignment stays database-only.

## Phase 1: Shared Foundation

These tasks unblock almost everything else.

- [ ] Add `User.role` with at least `user | admin`, defaulting to `user`.
- [ ] Add `User.accountStatus` with at least `active | forced_reset | suspended`, defaulting to `active`.
- [ ] Add indexes for `User.role` and `User.accountStatus`.
- [ ] Add `LocationGroup.shapeType` with `circle | polygon`, defaulting to `circle`.
- [ ] Add `LocationGroup.polygon` as an array of `{ latitude, longitude }` vertices.
- [ ] Add `LocationGroup.shapeUpdatedAt`.
- [ ] Keep legacy `centerLatitude`, `centerLongitude`, and `radiusMeters` support in place during migration.
- [ ] Add an admin audit log model/collection with:
  - `auditId`
  - `adminUserId`
  - `actionType`
  - `targetType`
  - `targetId`
  - `beforeSnapshot`
  - `afterSnapshot`
  - `createdAt`
- [ ] Add `REPORT_STALE_MINUTES` server config with default value `15`.
- [ ] Implement `requireAdmin` middleware.
- [ ] Protect all admin API routes with `protect` plus `requireAdmin`.
- [ ] Add `/admin` frontend route namespace.
- [ ] Add a dedicated admin shell/navigation distinct from the normal user flow.
- [ ] Add non-admin handling for direct admin URL access: redirect to login or show forbidden state.

## Parallel Workstreams

Once Phase 1 is in place, these tracks can move mostly in parallel.

### Workstream A: Admin Search And Active Reports

- [ ] Build `GET /api/admin/search` for admin search across `LocationGroup` and `StudyLocation`.
- [ ] Support search by:
  - group name
  - study location name
  - floor label
  - sublocation label
- [ ] Build `GET /api/admin/reports/active` with:
  - `groupId` and `locationId` filters
  - search term support
  - pagination
  - newest-first sorting
  - active/stale filtering based on `REPORT_STALE_MINUTES`
- [ ] Define active report logic as:
  - `reportKind = "live"`
  - `createdAt >= now - REPORT_STALE_MINUTES`
- [ ] Exclude stale reports from admin active-report views.
- [ ] Build `DELETE /api/admin/reports/:reportId`.
- [ ] Ensure report deletion also deletes paired `ReportTagMetadata` when present.
- [ ] Recompute affected study location and location group live aggregate values after report deletion.
- [ ] Write an admin audit log entry for report deletion.
- [ ] Build the `Admin Search` page as the default admin landing page.
- [ ] Show both search results list and map pins.
- [ ] Allow selection from either the list or the map.
- [ ] When a `LocationGroup` is selected, show:
  - group metadata
  - child `StudyLocation` records
  - active reports across child study locations
  - search within active reports
  - delete action for selected active reports
- [ ] When a `StudyLocation` is selected, show:
  - study location metadata
  - active reports for that location only
  - search within active reports
  - delete action for selected active reports
- [ ] Show report table fields:
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
- [ ] Add delete confirmations for report deletion.

### Workstream B: Group Geometry, Redraw, And Merge

- [ ] Implement geometry validation helpers for:
  - closed polygon shape
  - minimum 3 vertices
  - no self-intersection
  - no overlap with other group polygons
  - containment of all child `StudyLocation` markers
- [ ] Ensure the frontend can render both legacy circles and polygons during migration.
- [ ] Build `PUT /api/admin/location-groups/:groupId/shape`.
- [ ] Validate saved shapes server-side before persistence.
- [ ] Write an admin audit log entry for group redraw.
- [ ] Build `Redraw Group` mode entry points from:
  - searchable group list
  - map pin action
- [ ] In `Redraw Group` mode, support:
  - current boundary overlay display
  - child `StudyLocation` markers
  - add/move/remove polygon vertices
  - cancel before save
  - save only when polygon is valid
- [ ] Build `Location Edit` mode for selecting exactly two groups.
- [ ] Allow group selection from list or map.
- [ ] Visually highlight selected groups in list and on map.
- [ ] Enable merge actions only when exactly two distinct groups are selected.
- [ ] Build merge dialog with:
  - both source group names and IDs
  - new-name option
  - inherit-first-name option
  - inherit-second-name option
  - empty-name prevention
- [ ] Build `POST /api/admin/location-groups/merge`.
- [ ] On merge, create one destination `LocationGroup`.
- [ ] Reassign all child `StudyLocation.locationGroupId` references to the destination group.
- [ ] Keep reports attached to their existing `StudyLocation` records.
- [ ] Recalculate merged group live noise/occupancy values from child study locations.
- [ ] Auto-generate a provisional merged polygon boundary when possible.
- [ ] If the provisional boundary is invalid or overlapping, create a draft destination group and route directly into `Redraw Group` mode.
- [ ] Delete source groups only after the destination group has a valid saved boundary.
- [ ] Write an admin audit log entry for group merge.

### Workstream C: Manage Users

- [ ] Build `GET /api/admin/users`.
- [ ] Support quick search on the manage-users list.
- [ ] Return user list fields:
  - display name or fallback name/login
  - email
  - `userId`
  - trust score backed by `userOccupancyWF`
  - `role`
  - `accountStatus`
  - `emailVerifiedAt`
  - `createdAt`
- [ ] Build `PATCH /api/admin/users/:userId` for:
  - email updates
  - `userOccupancyWF` updates
  - role updates if allowed in phase 1
  - account status updates if allowed by product rules
- [ ] Enforce unique email validation on edit.
- [ ] Enforce allowed numeric bounds for `userOccupancyWF`.
- [ ] Label `userOccupancyWF` as trust score in the admin UI.
- [ ] Keep `userNoiseWF` non-editable in phase 1.
- [ ] Build `POST /api/admin/users/:userId/force-password-reset`.
- [ ] Force password reset flow should:
  - invalidate active sessions immediately
  - set `emailVerifiedAt = null`
  - issue a fresh `emailVerificationToken`
  - set `accountStatus = "forced_reset"`
  - set `passwordChangedAt = now`
  - send a new verification email
  - require password reset before normal login succeeds after reverification
- [ ] Write an admin audit log entry for forced password reset.
- [ ] Build `DELETE /api/admin/users/:userId`.
- [ ] Add strong confirmation UX for account deletion.
- [ ] Apply the chosen live-report handling policy on user deletion: hard-delete or anonymize.
- [ ] Leave archived summaries unchanged.
- [ ] Write an admin audit log entry for:
  - user email edit
  - trust-score adjustment
  - user deletion
- [ ] Build the `Manage Users` page with:
  - searchable user table/list
  - edit email flow
  - force password reset action
  - delete account action
  - trust score adjustment controls

## Integration And QA

- [ ] Verify `/admin` opens to `Admin Search`, not the normal user map home.
- [ ] Verify admin mode feels visually distinct from the normal user flow.
- [ ] Verify non-admin users cannot access admin UI routes.
- [ ] Verify non-admin users receive `403 Forbidden` for admin API routes.
- [ ] Verify destructive actions use clear confirmation language.
- [ ] Verify all destructive or security-sensitive actions create admin audit log entries.
- [ ] Verify mixed geometry compatibility for legacy circles and new polygons.
- [ ] Verify saved polygons never overlap other groups.
- [ ] Verify saved polygons always contain all child `StudyLocation` records.
- [ ] Verify merge requires exactly two distinct groups.
- [ ] Verify stale reports are hidden from admin active-report views.
- [ ] Verify deleting a live report refreshes affected location/group summary values without a full reload.
- [ ] Verify forced password reset invalidates old JWTs immediately.
- [ ] Verify existing APIs for normal user flows continue to work during migration.

## Suggested Team Split

- Track 1: Shared foundation, auth, route gating, and audit log plumbing.
- Track 2: Admin Search, active reports API, and report deletion flow.
- Track 3: Polygon validation, redraw flow, and group merge flow.
- Track 4: Manage Users APIs and UI.
- Track 5: Cross-cutting QA for permissions, destructive actions, and migration compatibility.

## Acceptance Checklist

- [ ] An admin can open `/admin`, search for a group or study location, and see active non-stale reports.
- [ ] An admin can delete a live report and see affected location/group values refresh.
- [ ] An admin can select exactly two groups and complete a merge into one destination group.
- [ ] An admin can redraw a group's boundary as a polygon and save only when it is valid and non-overlapping.
- [ ] An admin can open `Manage Users`, see each user's display name and trust score, edit email, force password reset, delete an account, and adjust trust score.
- [ ] A non-admin cannot access admin pages or admin API routes.
