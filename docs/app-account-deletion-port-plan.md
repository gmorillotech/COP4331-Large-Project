# App Account Deletion Port Plan

Date: 2026-04-14

## Goal

Port the existing self-service account deletion flow from the web app into the
Flutter app's Account Center, matching current backend behavior and avoiding any
server-side product changes unless explicitly requested later.

## What Exists Today

### Backend

- `server/routes/authRoutes.js` already exposes `DELETE /api/auth/account`
- `server/controllers/authController.js` already implements `deleteAccount`
- deletion is JWT-authenticated and only deletes the currently authenticated user
- user-owned reports are not removed; their `userId` is rewritten to
  `"deleted_user"` before the user record is deleted

Conclusion:
- no backend feature work is required for basic app parity

### Web

- `Web_Frontend/src/components/ProfilePanel.tsx` already exposes a `Delete Account`
  button in the profile panel
- the web flow uses a simple irreversible confirmation prompt
- on success, the web client clears `token` and `user_data` from local storage and
  redirects to `/`

Conclusion:
- the current parity target is a lightweight authenticated delete flow, not a
  re-auth or typed-confirmation flow

### Flutter App

- `flutter_application_1/lib/account_center/account_center_page.dart` already owns
  the user-facing account management surface
- `flutter_application_1/lib/account_center/account_center_backend.dart` already
  supports `loadProfile`, `updateProfile`, and `changePassword`, but not deletion
- `flutter_application_1/lib/auth/auth_service.dart` already owns session cleanup
  through `logout()`
- `flutter_application_1/lib/main.dart` already routes the app back to `LoginPage`
  whenever `AuthService.isAuthenticated` becomes false
- `flutter_application_1/test/account_center_page_test.dart` covers profile save,
  favorites sync, and password change, but not account deletion

Conclusion:
- the missing work is on the Flutter client side: backend client method, UI flow,
  and tests

## Recommended Implementation Scope

### 1. Extend the account-center backend client

File:
- `flutter_application_1/lib/account_center/account_center_backend.dart`

Work:
- add `deleteAccount()` to `AccountCenterBackendClient`
- implement it in `HttpAccountCenterBackendClient`
- send `DELETE /api/auth/account` with the same bearer token handling already used
  for other account-center calls
- keep existing unauthorized behavior: a `401` should still invoke
  `onUnauthorized`

Why here:
- deletion belongs beside the rest of the account-center API surface
- this keeps the UI layer from owning raw HTTP details

### 2. Add a destructive account deletion flow to the Account Center UI

File:
- `flutter_application_1/lib/account_center/account_center_page.dart`

Work:
- add a dedicated destructive section near the bottom of the page, separate from
  the password-change controls
- add a confirmation dialog that clearly states deletion is permanent
- guard against double-submission with a local loading flag
- on confirm, call `_backendClient.deleteAccount()`
- after a successful delete, call `AuthService.logout()` so local session state is
  cleared consistently with the rest of the app

Recommended UX shape:
- title like `Delete Account`
- supporting copy that mirrors the web's irreversible warning
- dialog buttons: `Cancel` and destructive `Delete Account`
- disabled state / progress label while deletion is in flight

### 3. Reuse existing session teardown instead of inventing a second path

Files:
- `flutter_application_1/lib/account_center/account_center_page.dart`
- `flutter_application_1/lib/auth/auth_service.dart`
- `flutter_application_1/lib/main.dart`

Work:
- use the existing `logout()` path after successful deletion rather than manually
  editing preferences in the page
- rely on the existing app shell behavior in `main.dart` to return the user to
  `LoginPage` once auth state is cleared

Why:
- it matches the web behavior at the product level
- it keeps the Flutter implementation aligned with current provider-driven routing

### 4. Add focused widget tests for the delete flow

File:
- `flutter_application_1/test/account_center_page_test.dart`

Work:
- extend the fake backend client with a `deleteAccount()` implementation and call
  tracking
- add a success-path test that:
  - opens the delete confirmation
  - confirms deletion
  - verifies the backend delete call happens
  - verifies the app session is logged out when wrapped with `AuthService`
- add an error-path test that:
  - simulates backend failure
  - verifies an inline error/banner is shown
  - verifies the session is not cleared on failure
- optionally add a cancel-path test to confirm no delete request is sent if the
  dialog is dismissed

## Suggested File-Level Change List For Implementation

- `flutter_application_1/lib/account_center/account_center_backend.dart`
- `flutter_application_1/lib/account_center/account_center_page.dart`
- `flutter_application_1/test/account_center_page_test.dart`

Possible but likely unnecessary:
- `flutter_application_1/lib/auth/auth_service.dart`

Not expected to require change:
- `server/controllers/authController.js`
- `server/routes/authRoutes.js`

## Behavioral Decisions To Keep Explicit

### Parity decision

If the goal is strict web-to-app parity, keep the same trust model:
- authenticated bearer token
- confirmation dialog
- immediate deletion on confirm

### Non-parity enhancements

Do not add these unless the product explicitly wants stronger friction:
- password re-entry before deletion
- typed confirmation phrase
- soft-delete / recovery window
- server-side cascade deletion of reports

Those would be product changes, not a straight port.

## Risks And Edge Cases

- stale token case: already handled by the account-center client's unauthorized
  callback pattern
- post-delete UI state: avoid setting page state after logout if the widget is
  unmounted during navigation/auth rebuild
- duplicate taps: guard with a deletion-in-progress flag
- tests without a provider: only the logout-verification test needs the real
  `AuthService` wrapper

## Validation Checklist For The Future Implementation

- delete action is visible from the app Account Center
- confirmation dialog appears and blocks accidental taps
- successful delete clears `token` and `user_data` through `AuthService.logout()`
- app returns to login after successful deletion
- failed delete keeps the user signed in and shows an actionable error
- existing profile save, favorite sync, and password tests still pass

## Bottom Line

This is a Flutter-side parity task, not a backend feature project. The server
and web flow already define the behavior; the app needs one new account-center
API method, one destructive UI flow, and a small set of widget tests.
