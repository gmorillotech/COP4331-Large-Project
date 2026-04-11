import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_application_1/auth/auth_models.dart';
import 'package:flutter_application_1/auth/auth_service.dart';
import 'package:flutter_application_1/auth/login_page.dart';
import 'package:provider/provider.dart';

void main() {
  testWidgets('registers in-app and verifies email with a code',
      (tester) async {
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
      'Password1!',
    );

    await tester.ensureVisible(find.byKey(const Key('register-submit-button')));
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

  testWidgets('rejects registration with invalid username', (tester) async {
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
      find.byKey(const Key('register-email-field')),
      'test@example.com',
    );
    await tester.enterText(
      find.byKey(const Key('register-username-field')),
      'ab',
    );
    await tester.enterText(
      find.byKey(const Key('register-password-field')),
      'Valid1pass!',
    );

    await tester.ensureVisible(find.byKey(const Key('register-submit-button')));
    await tester.tap(find.byKey(const Key('register-submit-button')));
    await tester.pumpAndSettle();

    expect(find.textContaining('3\u201322 characters'), findsWidgets);
    expect(authService.registerCalls, isEmpty);
  });

  testWidgets('rejects registration with invalid password', (tester) async {
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
      find.byKey(const Key('register-email-field')),
      'test@example.com',
    );
    await tester.enterText(
      find.byKey(const Key('register-username-field')),
      'validuser',
    );
    await tester.enterText(
      find.byKey(const Key('register-password-field')),
      'short',
    );

    await tester.ensureVisible(find.byKey(const Key('register-submit-button')));
    await tester.tap(find.byKey(const Key('register-submit-button')));
    await tester.pumpAndSettle();

    expect(find.textContaining('at least 8 characters'), findsOneWidget);
    expect(authService.registerCalls, isEmpty);
  });

  testWidgets('shows live validation rules while typing in register form',
      (tester) async {
    final authService = _FakeAuthService();

    await tester.pumpWidget(
      ChangeNotifierProvider<AuthService>.value(
        value: authService,
        child: const MaterialApp(home: LoginPage()),
      ),
    );

    await tester.tap(find.byKey(const Key('register-tab-button')));
    await tester.pumpAndSettle();

    // No rules shown before typing.
    expect(find.text('3\u201322 characters'), findsNothing);

    // Type a short username — rules appear.
    await tester.enterText(
      find.byKey(const Key('register-username-field')),
      'a',
    );
    await tester.pump();
    expect(find.text('3\u201322 characters'), findsOneWidget);
    expect(find.text('At least one letter'), findsOneWidget);

    // Type a valid username — rules still visible, both satisfied.
    await tester.enterText(
      find.byKey(const Key('register-username-field')),
      'validuser',
    );
    await tester.pump();
    expect(find.text('3\u201322 characters'), findsOneWidget);

    // Type a short password — password rules appear.
    await tester.enterText(
      find.byKey(const Key('register-password-field')),
      'ab',
    );
    await tester.pump();
    expect(find.text('At least 8 characters'), findsOneWidget);
    expect(find.text('At least one number'), findsOneWidget);
  });

  testWidgets('forgot password multi-step flow resets password in-app',
      (tester) async {
    final authService = _FakeAuthService();

    await tester.pumpWidget(
      ChangeNotifierProvider<AuthService>.value(
        value: authService,
        child: const MaterialApp(home: LoginPage()),
      ),
    );

    // Navigate to forgot password.
    await tester.tap(find.byKey(const Key('forgot-password-button')));
    await tester.pumpAndSettle();
    expect(find.text('FORGOT PASSWORD'), findsOneWidget);

    // Step 1: Enter username and submit.
    await tester.enterText(
      find.byKey(const Key('forgot-login-field')),
      'testuser',
    );
    await tester.tap(find.byKey(const Key('forgot-submit-button')));
    await tester.pumpAndSettle();

    expect(authService.forgotPasswordCalls, <String>['testuser']);
    expect(find.text('RESET PASSWORD'), findsOneWidget);
    expect(find.textContaining('te****@example.com'), findsWidgets);

    // Step 2: Enter reset code.
    await tester.enterText(
      find.byKey(const Key('reset-code-field')),
      '123456',
    );
    await tester.tap(find.byKey(const Key('reset-code-submit-button')));
    await tester.pumpAndSettle();

    expect(find.text('SET NEW PASSWORD'), findsOneWidget);

    // Step 3: Enter new password and confirm.
    await tester.enterText(
      find.byKey(const Key('reset-new-password-field')),
      'NewPass1!',
    );
    await tester.enterText(
      find.byKey(const Key('reset-confirm-password-field')),
      'NewPass1!',
    );
    await tester.tap(find.byKey(const Key('reset-password-submit-button')));
    await tester.pumpAndSettle();

    expect(authService.resetPasswordCalls, hasLength(1));
    expect(authService.resetPasswordCalls.single.email, 'tester@example.com');
    expect(authService.resetPasswordCalls.single.code, '123456');
    expect(authService.resetPasswordCalls.single.newPassword, 'NewPass1!');
    expect(find.text('LOG IN'), findsOneWidget);
    expect(
      find.textContaining('Password has been successfully reset'),
      findsOneWidget,
    );
  });

  testWidgets(
      'forced_reset_verify routes through verification then password reset',
      (tester) async {
    final authService = _FakeAuthService(
      loginError: const LoginFailure(
        reason: LoginFailureReason.forcedResetVerify,
        message: 'Please verify your email and reset your password.',
        email: 'student@example.com',
        maskedEmail: 'st*****@example.com',
        requiresPasswordReset: true,
      ),
      verifyResult: const VerificationResult(
        message: 'Email verified. Set a new password to continue.',
        requiresPasswordReset: true,
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

    // Login triggers forced_reset_verify.
    await tester.enterText(
      find.byKey(const Key('login-username-field')),
      'student',
    );
    await tester.enterText(
      find.byKey(const Key('login-password-field')),
      'password',
    );
    await tester.tap(find.byKey(const Key('login-submit-button')));
    await tester.pumpAndSettle();

    // Verification view appears.
    expect(find.text('VERIFY YOUR EMAIL'), findsOneWidget);
    expect(find.textContaining('st*****@example.com'), findsWidgets);

    // Enter verification code.
    await tester.enterText(
      find.byKey(const Key('verification-code-field')),
      '654321',
    );
    await tester.tap(find.byKey(const Key('login-verify-button')));
    await tester.pumpAndSettle();

    // Routes to new password (not back to login).
    expect(find.text('SET NEW PASSWORD'), findsOneWidget);
    expect(
      find.textContaining('Email verified. Set a new password to continue.'),
      findsOneWidget,
    );

    // Enter new password.
    await tester.enterText(
      find.byKey(const Key('reset-new-password-field')),
      'NewPass1!',
    );
    await tester.enterText(
      find.byKey(const Key('reset-confirm-password-field')),
      'NewPass1!',
    );
    await tester.tap(find.byKey(const Key('reset-password-submit-button')));
    await tester.pumpAndSettle();

    // Reset code reuses the verification code.
    expect(authService.resetPasswordCalls, hasLength(1));
    expect(authService.resetPasswordCalls.single.code, '654321');
    expect(find.text('LOG IN'), findsOneWidget);
  });

  testWidgets(
      'forced_reset routes directly to code entry and password reset',
      (tester) async {
    final authService = _FakeAuthService(
      loginError: const LoginFailure(
        reason: LoginFailureReason.forcedReset,
        message: 'A password reset is required.',
        email: 'student@example.com',
        maskedEmail: 'st*****@example.com',
        requiresPasswordReset: true,
      ),
    );

    await tester.pumpWidget(
      ChangeNotifierProvider<AuthService>.value(
        value: authService,
        child: const MaterialApp(home: LoginPage()),
      ),
    );

    // Login triggers forced_reset.
    await tester.enterText(
      find.byKey(const Key('login-username-field')),
      'student',
    );
    await tester.enterText(
      find.byKey(const Key('login-password-field')),
      'password',
    );
    await tester.tap(find.byKey(const Key('login-submit-button')));
    await tester.pumpAndSettle();

    // Goes directly to code entry (skips lookup).
    expect(find.text('RESET PASSWORD'), findsOneWidget);
    expect(find.textContaining('st*****@example.com'), findsWidgets);

    // Enter code.
    await tester.enterText(
      find.byKey(const Key('reset-code-field')),
      '789012',
    );
    await tester.tap(find.byKey(const Key('reset-code-submit-button')));
    await tester.pumpAndSettle();

    // Advances to new password.
    expect(find.text('SET NEW PASSWORD'), findsOneWidget);

    // Enter new password.
    await tester.enterText(
      find.byKey(const Key('reset-new-password-field')),
      'NewPass1!',
    );
    await tester.enterText(
      find.byKey(const Key('reset-confirm-password-field')),
      'NewPass1!',
    );
    await tester.tap(find.byKey(const Key('reset-password-submit-button')));
    await tester.pumpAndSettle();

    expect(authService.resetPasswordCalls, hasLength(1));
    expect(authService.resetPasswordCalls.single.code, '789012');
    expect(find.text('LOG IN'), findsOneWidget);
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
    this.verifyResult = const VerificationResult(
      message: 'Email verified successfully. You can now log in.',
    ),
    this.resendDelivery = const VerificationDelivery(
      message: 'Verification code sent! Check your inbox.',
      email: 'student@example.com',
      maskedEmail: 'st*****@example.com',
    ),
    this.forgotPasswordResult = const ForgotPasswordResult(
      message: 'If an account exists, a reset code has been sent.',
      email: 'tester@example.com',
      maskedEmail: 'te****@example.com',
    ),
    this.resetPasswordMessage = 'Password has been successfully reset.',
  }) : super(baseUrl: 'http://localhost');

  final LoginFailure? loginError;
  final RegisterResult registerResult;
  final VerificationResult verifyResult;
  final VerificationDelivery resendDelivery;
  final ForgotPasswordResult forgotPasswordResult;
  final String resetPasswordMessage;

  final List<_RegisterCall> registerCalls = <_RegisterCall>[];
  final List<_VerifyCall> verifyCalls = <_VerifyCall>[];
  final List<String> resendCalls = <String>[];
  final List<String> forgotPasswordCalls = <String>[];
  final List<_ResetPasswordCall> resetPasswordCalls = <_ResetPasswordCall>[];

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
  Future<VerificationResult> verifyEmail({
    required String email,
    required String code,
  }) async {
    verifyCalls.add(_VerifyCall(email: email, code: code));
    return verifyResult;
  }

  @override
  Future<VerificationDelivery> resendVerification({
    required String email,
  }) async {
    resendCalls.add(email);
    return resendDelivery;
  }

  @override
  Future<ForgotPasswordResult> forgotPassword({
    required String login,
  }) async {
    forgotPasswordCalls.add(login);
    return forgotPasswordResult;
  }

  @override
  Future<String> resetPassword({
    required String email,
    required String code,
    required String newPassword,
  }) async {
    resetPasswordCalls.add(
      _ResetPasswordCall(email: email, code: code, newPassword: newPassword),
    );
    return resetPasswordMessage;
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
    return other is _VerifyCall && other.email == email && other.code == code;
  }

  @override
  int get hashCode => Object.hash(email, code);
}

class _ResetPasswordCall {
  const _ResetPasswordCall({
    required this.email,
    required this.code,
    required this.newPassword,
  });

  final String email;
  final String code;
  final String newPassword;
}
