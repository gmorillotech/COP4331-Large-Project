import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_application_1/auth/auth_models.dart';
import 'package:flutter_application_1/auth/auth_service.dart';
import 'package:flutter_application_1/auth/login_page.dart';
import 'package:provider/provider.dart';

void main() {
  testWidgets('registers in-app and verifies email with a code', (tester) async {
    final authService = _FakeAuthService();

    await tester.pumpWidget(
      ChangeNotifierProvider<AuthService>.value(
        value: authService,
        child: const MaterialApp(home: LoginPage()),
      ),
    );

    await tester.tap(find.byKey(const Key('register-tab-button')));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('register-first-name-field')),
      'Taylor',
    );
    await tester.enterText(
      find.byKey(const Key('register-last-name-field')),
      'Student',
    );
    await tester.enterText(
      find.byKey(const Key('register-display-name-field')),
      'QuietTaylor',
    );
    await tester.enterText(
      find.byKey(const Key('register-email-field')),
      'tester@example.com',
    );
    await tester.enterText(
      find.byKey(const Key('register-username-field')),
      'testuser',
    );
    await tester.enterText(
      find.byKey(const Key('register-password-field')),
      'password-123',
    );

    await tester.tap(find.byKey(const Key('register-submit-button')));
    await tester.pumpAndSettle();

    expect(authService.registerCalls, hasLength(1));
    expect(authService.registerCalls.single.login, 'testuser');
    expect(find.text('CHECK YOUR EMAIL'), findsOneWidget);
    expect(
      find.textContaining('te****@example.com'),
      findsWidgets,
    );

    await tester.enterText(
      find.byKey(const Key('verification-code-field')),
      '123456',
    );
    await tester.tap(find.byKey(const Key('register-verify-button')));
    await tester.pumpAndSettle();

    expect(authService.verifyCalls, hasLength(1));
    expect(
      authService.verifyCalls.single,
      const _VerifyCall(email: 'tester@example.com', code: '123456'),
    );
    expect(find.text('LOG IN'), findsOneWidget);
    expect(
      find.text('Email verified successfully. You can now log in.'),
      findsOneWidget,
    );
  });

  testWidgets('login failure for unverified account opens verification flow',
      (tester) async {
    final authService = _FakeAuthService(
      loginError: const LoginFailure(
        reason: LoginFailureReason.emailNotVerified,
        message: 'Please verify your email before logging in.',
        email: 'student@example.com',
        maskedEmail: 'st*****@example.com',
      ),
    );

    await tester.pumpWidget(
      ChangeNotifierProvider<AuthService>.value(
        value: authService,
        child: const MaterialApp(home: LoginPage()),
      ),
    );

    await tester.enterText(
      find.byKey(const Key('login-username-field')),
      'student',
    );
    await tester.enterText(
      find.byKey(const Key('login-password-field')),
      'password-123',
    );

    await tester.tap(find.byKey(const Key('login-submit-button')));
    await tester.pumpAndSettle();

    expect(find.text('VERIFY YOUR EMAIL'), findsOneWidget);
    expect(
      find.textContaining('st*****@example.com'),
      findsWidgets,
    );

    await tester.tap(find.byKey(const Key('login-resend-code-button')));
    await tester.pumpAndSettle();

    expect(authService.resendCalls, <String>['student@example.com']);
    expect(
      find.text('A new 6-digit code was sent to st*****@example.com.'),
      findsOneWidget,
    );
  });
}

class _FakeAuthService extends AuthService {
  _FakeAuthService({
    this.loginError,
    this.registerResult = const RegisterResult(
      userId: 'user-1',
      login: 'testuser',
      email: 'tester@example.com',
      maskedEmail: 'te****@example.com',
      message:
          'Registration successful. Please check your email for a verification code.',
    ),
    this.verifyMessage = 'Email verified successfully. You can now log in.',
    this.resendDelivery = const VerificationDelivery(
      message: 'Verification code sent! Check your inbox.',
      email: 'student@example.com',
      maskedEmail: 'st*****@example.com',
    ),
  }) : super(baseUrl: 'http://localhost');

  final LoginFailure? loginError;
  final RegisterResult registerResult;
  final String verifyMessage;
  final VerificationDelivery resendDelivery;

  final List<_RegisterCall> registerCalls = <_RegisterCall>[];
  final List<_VerifyCall> verifyCalls = <_VerifyCall>[];
  final List<String> resendCalls = <String>[];

  @override
  Future<LoginResult> login({
    required String login,
    required String password,
  }) async {
    if (loginError != null) {
      throw loginError!;
    }

    return LoginResult(
      accessToken: 'token',
      user: AuthUser(
        userId: 'user-1',
        login: login,
        email: 'tester@example.com',
      ),
    );
  }

  @override
  Future<RegisterResult> register({
    required String login,
    required String email,
    required String password,
    String? firstName,
    String? lastName,
    String? displayName,
  }) async {
    registerCalls.add(
      _RegisterCall(
        login: login,
        email: email,
        password: password,
        firstName: firstName,
        lastName: lastName,
        displayName: displayName,
      ),
    );
    return registerResult;
  }

  @override
  Future<String> verifyEmail({
    required String email,
    required String code,
  }) async {
    verifyCalls.add(_VerifyCall(email: email, code: code));
    return verifyMessage;
  }

  @override
  Future<VerificationDelivery> resendVerification({
    required String email,
  }) async {
    resendCalls.add(email);
    return resendDelivery;
  }
}

class _RegisterCall {
  const _RegisterCall({
    required this.login,
    required this.email,
    required this.password,
    required this.firstName,
    required this.lastName,
    required this.displayName,
  });

  final String login;
  final String email;
  final String password;
  final String? firstName;
  final String? lastName;
  final String? displayName;
}

class _VerifyCall {
  const _VerifyCall({
    required this.email,
    required this.code,
  });

  final String email;
  final String code;

  @override
  bool operator ==(Object other) {
    return other is _VerifyCall &&
        other.email == email &&
        other.code == code;
  }

  @override
  int get hashCode => Object.hash(email, code);
}
