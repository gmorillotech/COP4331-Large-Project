# Map vs Web Parity Analysis

Audit date: 2026-04-11

Scope: compare the Flutter map-first client in `flutter_application_1/` against the React web client in `Web_Frontend/` and call out features that currently exist on only one side.

## Web-only features

- Admin surface is still web-only.
  - The web app exposes `/admin`, `/admin/users`, `/admin/redraw/:groupId`, `/admin/split/:groupId`, and `/admin/locations` in `Web_Frontend/src/App.tsx:18-27`.
  - The login flow routes admins to `/admin` via `navigate(res.user.role === 'admin' ? '/admin' : '/home')` in `Web_Frontend/src/components/Login.tsx:235`.
  - The admin UI includes user search/edit/force-reset/delete in `Web_Frontend/src/pages/admin/ManageUsersPage.tsx` and `Web_Frontend/src/components/admin/UserTable.tsx:125-188`, plus location search/detail in `Web_Frontend/src/pages/admin/AdminSearchPage.tsx:116-163`, group merge in `Web_Frontend/src/pages/admin/LocationEditPage.tsx:154-170`, and redraw/split flows in `Web_Frontend/src/pages/admin/RedrawGroupPage.tsx` and `Web_Frontend/src/pages/admin/SplitGroupPage.tsx`.
  - The Flutter app only registers `/map`, `/data-collection`, and `/account-center` in `flutter_application_1/lib/main.dart:20-22`, and its auth model does not carry `role` or `accountStatus` in `flutter_application_1/lib/auth/auth_models.dart:1-50`.

- The web login flow has fuller auth recovery and forced-reset handling.
  - Web implements username validation, password validation, forced-reset-verify handling, forced-reset handling, `requiresPasswordReset` continuation, and an actual `/api/auth/reset-password` call in `Web_Frontend/src/components/Login.tsx:54-63`, `Web_Frontend/src/components/Login.tsx:184-196`, `Web_Frontend/src/components/Login.tsx:352-368`, and `Web_Frontend/src/components/Login.tsx:422-432`.
  - Flutter login currently has login/register/forgot-password request/resend-verification/verify-email states, but no reset-password step and no UI branch for forced-reset flows in `flutter_application_1/lib/auth/login_page.dart:9`, `flutter_application_1/lib/auth/login_page.dart:128`, `flutter_application_1/lib/auth/login_page.dart:261`, and `flutter_application_1/lib/auth/login_page.dart:317`.
  - Flutter `AuthService` can surface `forcedReset`, but the page does not consume it (`flutter_application_1/lib/auth/auth_models.dart:114`, `flutter_application_1/lib/auth/auth_service.dart:80`).

- The web map has presentation features the Flutter map still does not mirror.
  - Web fetches `GET /api/map-annotations`, exposes a manual `Refresh` button, and renders animated asset-based markers through `mapMarkerAnimation.ts` and `MapMarkerVisual.tsx` in `Web_Frontend/src/components/map/MapExplorer.tsx:103`, `Web_Frontend/src/components/map/MapExplorer.tsx:258-260`, and `Web_Frontend/src/components/map/MapMarkerVisual.tsx:43-81`.
  - Flutter renders custom overlay pins directly in `main.dart` and does not consume `noiseBand` / `isAnimated` marker state in `flutter_application_1/lib/main.dart:1328-1415` and `flutter_application_1/lib/main.dart:2032-2098`.

## Map/app-only features

- The Flutter app has a much richer account center than the web profile drawer.
  - Flutter account center edits first name, last name, display name, `hideLocation`, `pinColor`, and favorites, and displays trust factors plus `passwordChangedAt` in `flutter_application_1/lib/account_center/account_center_page.dart:421-741` and `flutter_application_1/lib/account_center/account_center_page.dart:1080-1082`.
  - Flutter sends `hideLocation`, `pinColor`, `favorites`, and profile fields to `/api/auth/profile`, and changes passwords through `/api/auth/change-password` in `flutter_application_1/lib/account_center/account_center_backend.dart:259-289`.
  - Web profile UI only edits display name and runs a forgot/reset-password flow; it does not expose `hideLocation`, `pinColor`, trust factors, first/last name editing, or a current-password change form in `Web_Frontend/src/components/ProfilePanel.tsx:177-200` and `Web_Frontend/src/components/ProfilePanel.tsx:213-280`.

- The Flutter map exposes richer search/filter controls than the web map.
  - Flutter supports three sort priorities, distance radius, min/max noise, max occupancy, and show toggles in `flutter_application_1/lib/main.dart:790-800` and `flutter_application_1/lib/main.dart:1536-1648`.
  - Web only exposes search, a single sort dropdown, severity chips, and refresh in `Web_Frontend/src/components/map/MapExplorer.tsx:40-44`, `Web_Frontend/src/components/map/MapExplorer.tsx:83`, and `Web_Frontend/src/components/map/MapExplorer.tsx:214-260`.

- Flutter data collection is much more capable operationally.
  - Flutter supports background Android collection, queued offline retries, draft review, and adding a new study area inside an existing group in `flutter_application_1/lib/data_collection/data_collection_screen.dart:407-443`, `flutter_application_1/lib/data_collection/data_collection_screen.dart:1004-1312`, `flutter_application_1/lib/data_collection/data_collection_screen.dart:1054-1126`, and `flutter_application_1/lib/data_collection/data_collection_screen.dart:3056-3100`.
  - Web `SessionManager` supports live browser capture and "Create Group + First Study Area", but not background collection, retry queueing, draft review, or add-location-to-existing-group in `Web_Frontend/src/components/SessionManager.tsx:440-740`.

- Flutter has an app-only "Users" filter toggle that is not wired through the shared search contract.
  - The UI tracks `_showUsers` in `flutter_application_1/lib/main.dart:415` and exposes the toggle in `flutter_application_1/lib/main.dart:1643-1648`.
  - But the query builder only serializes `includeGroups` and `includeLocations` in `flutter_application_1/lib/map_search/map_search_viewport.dart:19-30`, and the backend search service only understands groups and locations in `server/services/locationSearchService.js`.
  - This is effectively an app-only placeholder rather than a real parity feature.

## Shared features that have drifted

- The two map surfaces do not use the same public search/feed endpoint.
  - Web map uses `/api/map-annotations` in `Web_Frontend/src/components/map/MapExplorer.tsx:103`.
  - Flutter map uses `/api/locations/search` in `flutter_application_1/lib/main.dart:814`.
  - Because the clients are not consuming the same map payload, map behavior can drift even when the product intent is "the same feature."

- Password management is split across different surfaces.
  - Web concentrates recovery in login/profile reset-code flows.
  - Flutter has a better authenticated password-change screen, but its login recovery flow stops after sending the reset code.
  - Users therefore get different capabilities depending on platform, even though both talk to the same auth backend.

## Highest-priority parity gaps

1. Decide whether admin remains intentionally web-only or whether Flutter needs any admin routing and user/location management.
2. Bring Flutter auth/login recovery up to web parity: forced-reset handling, reset-password completion, and validation rules.
3. Decide whether the public map should converge on one backend feed and one marker system, or remain intentionally split between `map-annotations` and `locations/search`.
4. Decide whether web should gain any of the Flutter account-center and data-collection robustness features, especially `hideLocation`, `pinColor`, current-password change, offline queueing, and existing-group study-area creation.
