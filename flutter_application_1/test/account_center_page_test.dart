import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_application_1/account_center/account_center_backend.dart';
import 'package:flutter_application_1/account_center/account_center_models.dart';
import 'package:flutter_application_1/account_center/account_center_page.dart';
import 'package:flutter_application_1/auth/auth_models.dart';
import 'package:flutter_application_1/auth/auth_service.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('renders account center sections and saves profile edits',
      (tester) async {
    final backend = _FakeAccountCenterBackendClient();

    await tester.pumpWidget(
      MaterialApp(
        home: AccountCenterPage(backendClient: backend),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('General'), findsOneWidget);
    expect(find.text('Color Choice'), findsOneWidget);
    expect(find.text('Preferences'), findsOneWidget);
    expect(find.text('Security Preferences'), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('display-name-field')),
      'Quiet Hero',
    );
    await tester.ensureVisible(find.byKey(const Key('color-swatch-#2563EB')));
    await tester.tap(find.byKey(const Key('color-swatch-#2563EB')));
    await tester.enterText(
      find.byKey(const Key('favorite-input')),
      'student-union-food-court',
    );
    await tester.ensureVisible(find.byKey(const Key('add-favorite-button')));
    await tester.tap(find.byKey(const Key('add-favorite-button')));
    await tester.ensureVisible(find.byKey(const Key('general-save-button')));
    await tester.tap(find.byKey(const Key('general-save-button')));
    await tester.pumpAndSettle();

    expect(backend.savedProfiles, hasLength(1));
    expect(backend.savedProfiles.single.displayName, 'Quiet Hero');
    expect(backend.savedProfiles.single.pinColor, '#2563EB');
    expect(
      backend.savedProfiles.single.favorites,
      contains('student-union-food-court'),
    );
    expect(find.text('Profile changes saved to the fake backend.'), findsOneWidget);
  });

  testWidgets('validates and submits security preference updates',
      (tester) async {
    final backend = _FakeAccountCenterBackendClient();

    await tester.pumpWidget(
      MaterialApp(
        home: AccountCenterPage(backendClient: backend),
      ),
    );
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.byKey(const Key('security-submit-button')));
    await tester.enterText(
      find.byKey(const Key('current-password-field')),
      'current-pass',
    );
    await tester.enterText(
      find.byKey(const Key('new-password-field')),
      'new-password-1',
    );
    await tester.enterText(
      find.byKey(const Key('confirm-password-field')),
      'different-password',
    );
    await tester.ensureVisible(find.byKey(const Key('security-submit-button')));
    await tester.tap(find.byKey(const Key('security-submit-button')));
    await tester.pumpAndSettle();

    expect(find.text('New password and confirmation do not match.'), findsOneWidget);
    expect(backend.passwordChanges, isEmpty);

    await tester.enterText(
      find.byKey(const Key('confirm-password-field')),
      'new-password-1',
    );
    await tester.tap(find.byKey(const Key('security-submit-button')));
    await tester.pumpAndSettle();

    expect(backend.passwordChanges, hasLength(1));
    expect(backend.passwordChanges.single.currentPassword, 'current-pass');
    expect(backend.passwordChanges.single.newPassword, 'new-password-1');
    expect(find.text('Password updated on the fake backend.'), findsOneWidget);
  });

  testWidgets('syncs saved favorites back into the authenticated app session',
      (tester) async {
    SharedPreferences.setMockInitialValues({
      'token': 'session-token',
      'user_data': jsonEncode(
        const AuthUser(
          userId: 'test-user',
          login: 'test-user',
          email: 'test@example.com',
          favorites: <String>['library-floor-2-moderate'],
        ).toJson(),
      ),
    });
    final prefs = await SharedPreferences.getInstance();
    final authService = AuthService(prefs: prefs);
    await authService.initialize();
    final backend = _FakeAccountCenterBackendClient();

    await tester.pumpWidget(
      ChangeNotifierProvider<AuthService>.value(
        value: authService,
        child: MaterialApp(
          home: AccountCenterPage(backendClient: backend),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(authService.user?.favorites, <String>['library-floor-1-quiet']);

    await tester.enterText(
      find.byKey(const Key('favorite-input')),
      'student-union-food-court',
    );
    await tester.ensureVisible(find.byKey(const Key('add-favorite-button')));
    await tester.tap(find.byKey(const Key('add-favorite-button')));
    await tester.ensureVisible(find.byKey(const Key('general-save-button')));
    await tester.tap(find.byKey(const Key('general-save-button')));
    await tester.pumpAndSettle();

    expect(
      authService.user?.favorites,
      containsAll(<String>[
        'library-floor-1-quiet',
        'student-union-food-court',
      ]),
    );
  });

  testWidgets('rejects password change missing complexity rules',
      (tester) async {
    final backend = _FakeAccountCenterBackendClient();

    await tester.pumpWidget(
      MaterialApp(
        home: AccountCenterPage(backendClient: backend),
      ),
    );
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.byKey(const Key('security-submit-button')));
    await tester.enterText(
      find.byKey(const Key('current-password-field')),
      'current-pass',
    );
    await tester.enterText(
      find.byKey(const Key('new-password-field')),
      'onlyletters',
    );
    await tester.enterText(
      find.byKey(const Key('confirm-password-field')),
      'onlyletters',
    );
    await tester.ensureVisible(find.byKey(const Key('security-submit-button')));
    await tester.tap(find.byKey(const Key('security-submit-button')));
    await tester.pumpAndSettle();

    expect(find.textContaining('at least one number'), findsOneWidget);
    expect(backend.passwordChanges, isEmpty);
  });

}

class _FakeAccountCenterBackendClient implements AccountCenterBackendClient {
  _FakeAccountCenterBackendClient()
      : _profile = AccountProfile(
          userId: 'test-user',
          login: 'test-user',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          displayName: 'Tester',
          pinColor: '#0F766E',
          favorites: const <String>['library-floor-1-quiet'],
          userNoiseWF: 1.1,
          userOccupancyWF: 0.9,
          passwordChangedAt: DateTime(2026, 4, 1, 9, 30),
        );

  AccountProfile _profile;
  final List<AccountProfile> savedProfiles = <AccountProfile>[];
  final List<_PasswordChangeRequest> passwordChanges =
      <_PasswordChangeRequest>[];

  @override
  Future<AccountProfileResult> loadProfile() async {
    return AccountProfileResult(
      profile: _profile,
      mode: AccountSyncMode.remote,
      message: 'Loaded from the fake backend.',
    );
  }

  @override
  Future<AccountProfileResult> updateProfile(AccountProfile profile) async {
    _profile = profile;
    savedProfiles.add(profile);
    return AccountProfileResult(
      profile: _profile,
      mode: AccountSyncMode.remote,
      message: 'Profile changes saved to the fake backend.',
    );
  }

  @override
  Future<AccountActionResult> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    if (currentPassword != 'current-pass') {
      throw StateError('Current password is incorrect.');
    }

    passwordChanges.add(
      _PasswordChangeRequest(
        currentPassword: currentPassword,
        newPassword: newPassword,
      ),
    );
    _profile = _profile.copyWith(passwordChangedAt: DateTime(2026, 4, 3, 12));
    return const AccountActionResult(
      mode: AccountSyncMode.remote,
      message: 'Password updated on the fake backend.',
    );
  }
}

class _PasswordChangeRequest {
  const _PasswordChangeRequest({
    required this.currentPassword,
    required this.newPassword,
  });

  final String currentPassword;
  final String newPassword;
}
