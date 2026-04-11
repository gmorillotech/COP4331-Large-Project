import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';
import 'auth_models.dart';

class AuthService extends ChangeNotifier {
  AuthService({SharedPreferences? prefs, String? baseUrl})
      : _prefs = prefs,
        _baseUrl = (baseUrl ?? apiBaseUrl()).trim();

  SharedPreferences? _prefs;
  final String _baseUrl;

  String? _token;
  AuthUser? _user;
  bool _initializing = true;

  String? get token => _token;
  AuthUser? get user => _user;
  bool get isAuthenticated => _token != null;
  bool get initializing => _initializing;

  Future<void> initialize() async {
    _prefs ??= await SharedPreferences.getInstance();
    final savedToken = _prefs!.getString('token');
    final savedUser = _prefs!.getString('user_data');

    if (savedToken != null && savedToken.isNotEmpty && savedUser != null) {
      _token = savedToken;
      try {
        _user = AuthUser.fromJson(
          Map<String, dynamic>.from(jsonDecode(savedUser) as Map),
        );
      } catch (_) {
        _token = null;
      }
    }

    _initializing = false;
    notifyListeners();
  }

  Future<LoginResult> login({
    required String login,
    required String password,
  }) async {
    final response = await _post('/api/auth/login', {
      'login': login,
      'password': password,
    });

    final res = response.body;

    if (!response.ok) {
      final errorMsg = res['error'] as String? ?? '';
      final reason = (res['reason'] as String? ?? '').trim().toLowerCase();
      final resolvedEmail = _normalizeEmail(res['email'] as String?);
      final resolvedMaskedEmail =
          (res['maskedEmail'] as String?)?.trim().isNotEmpty == true
              ? (res['maskedEmail'] as String).trim()
              : (resolvedEmail.isNotEmpty ? _maskEmail(resolvedEmail) : null);

      if (reason == 'email_not_verified') {
        throw LoginFailure(
          reason: LoginFailureReason.emailNotVerified,
          message: errorMsg.isNotEmpty
              ? errorMsg
              : 'Your account is not verified. Please check your email for a verification code or request a new one.',
          email: resolvedEmail.isNotEmpty ? resolvedEmail : null,
          maskedEmail: resolvedMaskedEmail,
        );
      }

      if (reason == 'forced_reset_verify') {
        throw LoginFailure(
          reason: LoginFailureReason.forcedResetVerify,
          message: errorMsg.isNotEmpty
              ? errorMsg
              : 'Please verify your email and reset your password.',
          email: resolvedEmail.isNotEmpty ? resolvedEmail : null,
          maskedEmail: resolvedMaskedEmail,
          requiresPasswordReset: true,
        );
      }

      if (reason == 'forced_reset') {
        throw LoginFailure(
          reason: LoginFailureReason.forcedReset,
          message: errorMsg.isNotEmpty
              ? errorMsg
              : 'A password reset is required for this account.',
          email: resolvedEmail.isNotEmpty ? resolvedEmail : null,
          maskedEmail: resolvedMaskedEmail,
          requiresPasswordReset: true,
        );
      }

      throw LoginFailure(
        reason: response.statusCode >= 500
            ? LoginFailureReason.serverError
            : LoginFailureReason.invalidCredentials,
        message: errorMsg.isNotEmpty
            ? errorMsg
            : 'User/Password combination incorrect',
      );
    }

    final result = LoginResult.fromJson(res);
    _token = result.accessToken;
    _user = result.user;
    await _prefs?.setString('token', result.accessToken);
    await _prefs?.setString('user_data', jsonEncode(result.user.toJson()));

    notifyListeners();
    return result;
  }

  Future<void> logout() async {
    _token = null;
    _user = null;
    await _prefs?.remove('token');
    await _prefs?.remove('user_data');
    notifyListeners();
  }

  Future<void> setCachedFavorites(List<String> favorites) async {
    final user = _user;
    if (user == null) {
      return;
    }

    final normalized = favorites
        .map((entry) => entry.trim())
        .where((entry) => entry.isNotEmpty)
        .toSet()
        .toList(growable: false);

    if (listEquals(user.favorites, normalized)) {
      return;
    }

    _user = AuthUser(
      userId: user.userId,
      login: user.login,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      favorites: normalized,
      userNoiseWF: user.userNoiseWF,
      userOccupancyWF: user.userOccupancyWF,
      role: user.role,
      accountStatus: user.accountStatus,
    );
    await _persistSession();
    notifyListeners();
  }

  Future<void> saveFavorites(List<String> favorites) async {
    final user = _user;
    final token = _token;

    if (user == null) {
      return;
    }

    final normalized = favorites
        .map((entry) => entry.trim())
        .where((entry) => entry.isNotEmpty)
        .toSet()
        .toList(growable: false);

    if (token == null || token.isEmpty) {
      await setCachedFavorites(normalized);
      return;
    }

    final response = await _sendJson(
      path: '/api/auth/profile',
      method: 'PUT',
      body: <String, dynamic>{
        'favorites': normalized,
      },
      token: token,
    );

    if (!response.ok) {
      if (response.statusCode == 401) {
        handleUnauthorized();
        throw const LoginFailure(
          reason: LoginFailureReason.serverError,
          message: 'Session expired. Please log in again.',
        );
      }
      throw LoginFailure(
        reason: LoginFailureReason.serverError,
        message: response.body['error'] as String? ??
            'Unable to save favorites right now.',
      );
    }

    _user = AuthUser.fromJson(response.body);
    await _persistSession();
    notifyListeners();
  }

  Future<ForgotPasswordResult> forgotPassword({
    required String login,
  }) async {
    final response = await _post('/api/auth/forgot-password', {
      'login': login.trim(),
    });

    if (!response.ok) {
      throw LoginFailure(
        reason: response.statusCode >= 500
            ? LoginFailureReason.serverError
            : LoginFailureReason.invalidCredentials,
        message: response.body['error'] as String? ??
            'Unable to send password reset code.',
      );
    }

    return ForgotPasswordResult(
      message: response.body['message'] as String? ??
          'Password reset code sent to your email.',
      email: response.body['email'] as String?,
      maskedEmail: response.body['maskedEmail'] as String?,
    );
  }

  Future<String> resetPassword({
    required String email,
    required String code,
    required String newPassword,
  }) async {
    final response = await _post('/api/auth/reset-password', {
      'email': _normalizeEmail(email),
      'code': code.trim(),
      'newPassword': newPassword,
    });

    if (!response.ok) {
      throw LoginFailure(
        reason: response.statusCode >= 500
            ? LoginFailureReason.serverError
            : LoginFailureReason.invalidCredentials,
        message: response.body['error'] as String? ??
            'Invalid or expired reset code.',
      );
    }

    return response.body['message'] as String? ??
        'Password has been successfully reset.';
  }

  Future<RegisterResult> register({
    required String login,
    required String email,
    required String password,
    String? firstName,
    String? lastName,
    String? displayName,
  }) async {
    final response = await _post('/api/auth/register', {
      'firstName': firstName,
      'lastName': lastName,
      'displayName': displayName,
      'login': login,
      'email': email,
      'password': password,
    });

    if (!response.ok) {
      throw LoginFailure(
        reason: response.statusCode >= 500
            ? LoginFailureReason.serverError
            : LoginFailureReason.invalidCredentials,
        message: response.body['error'] as String? ??
            'Registration failed. Please try again.',
      );
    }

    return RegisterResult.fromJson(response.body);
  }

  Future<VerificationResult> verifyEmail({
    required String email,
    required String code,
  }) async {
    final response = await _post('/api/auth/verify-email', {
      'email': _normalizeEmail(email),
      'code': code.trim(),
    });

    if (!response.ok) {
      throw LoginFailure(
        reason: response.statusCode >= 500
            ? LoginFailureReason.serverError
            : LoginFailureReason.invalidCredentials,
        message: response.body['error'] as String? ??
            'Invalid or expired verification code.',
      );
    }

    return VerificationResult(
      message: response.body['message'] as String? ??
          'Email verified successfully. You can now log in.',
      requiresPasswordReset:
          response.body['requiresPasswordReset'] as bool? ?? false,
      email: response.body['email'] as String?,
      maskedEmail: response.body['maskedEmail'] as String?,
    );
  }

  Future<VerificationDelivery> resendVerification({
    required String email,
  }) async {
    final response = await _post('/api/auth/resend-verification', {
      'email': _normalizeEmail(email),
    });

    if (!response.ok) {
      throw LoginFailure(
        reason: LoginFailureReason.serverError,
        message: response.body['error'] as String? ??
            'Unable to resend verification code.',
      );
    }

    return VerificationDelivery.fromJson(response.body);
  }

  void handleUnauthorized() {
    logout();
  }

  Future<_HttpResponse> _post(
    String path,
    Map<String, dynamic> body,
  ) async {
    return _sendJson(path: path, method: 'POST', body: body);
  }

  Future<_HttpResponse> _sendJson({
    required String path,
    required String method,
    required Map<String, dynamic> body,
    String? token,
  }) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 6);
    try {
      final uri = Uri.parse('$_baseUrl$path');
      final request = await client.openUrl(method, uri).timeout(
            const Duration(seconds: 6),
          );
      request.persistentConnection = false;
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      request.headers.contentType = ContentType.json;
      if (token != null && token.isNotEmpty) {
        request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      }
      request.write(jsonEncode(body));

      final response = await request.close();
      final text = await response.transform(utf8.decoder).join().timeout(
            const Duration(seconds: 6),
          );

      final payload = text.trim().isEmpty
          ? <String, dynamic>{}
          : Map<String, dynamic>.from(jsonDecode(text) as Map);

      return _HttpResponse(
        statusCode: response.statusCode,
        body: payload,
      );
    } catch (e) {
      if (e is LoginFailure) {
        rethrow;
      }
      throw const LoginFailure(
        reason: LoginFailureReason.networkError,
        message: 'Unable to contact the server',
      );
    } finally {
      client.close(force: true);
    }
  }

  Future<void> _persistSession() async {
    final token = _token;
    final user = _user;

    if (token != null && token.isNotEmpty) {
      await _prefs?.setString('token', token);
    }
    if (user != null) {
      await _prefs?.setString('user_data', jsonEncode(user.toJson()));
    }
  }
}

String _normalizeEmail(String? email) {
  return (email ?? '').trim().toLowerCase();
}

String _maskEmail(String email) {
  final normalizedEmail = _normalizeEmail(email);
  final atIndex = normalizedEmail.indexOf('@');
  if (atIndex <= 0) {
    return normalizedEmail;
  }

  final localPart = normalizedEmail.substring(0, atIndex);
  final domain = normalizedEmail.substring(atIndex + 1);
  final visiblePart =
      localPart.length <= 2 ? localPart : localPart.substring(0, 2);
  final maskedPart = List.filled(
    localPart.length - visiblePart.length,
    '*',
  ).join();
  return '$visiblePart$maskedPart@$domain';
}

class _HttpResponse {
  const _HttpResponse({required this.statusCode, required this.body});

  final int statusCode;
  final Map<String, dynamic> body;

  bool get ok => statusCode >= 200 && statusCode < 300;
}
