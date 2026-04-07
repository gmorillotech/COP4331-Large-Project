import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';
import 'auth_models.dart';

// ── AuthService ── mirrors the web frontend's localStorage + fetch pattern ──

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

  // ── Initialize (read from SharedPreferences, like web reads localStorage) ──

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

  // ── Login (mirrors doLogin in Login.tsx) ──

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
      if (errorMsg.toLowerCase().contains('verify')) {
        throw LoginFailure(
          reason: LoginFailureReason.emailNotVerified,
          message:
              'Your account is not verified. Please check your email or resend the verification link.',
        );
      }
      throw LoginFailure(
        reason: LoginFailureReason.invalidCredentials,
        message: errorMsg.isNotEmpty
            ? errorMsg
            : 'User/Password combination incorrect',
      );
    }

    final result = LoginResult.fromJson(res);

    // localStorage.setItem('user_data', JSON.stringify(res.user));
    // localStorage.setItem('token', res.accessToken);
    _token = result.accessToken;
    _user = result.user;
    await _prefs?.setString('token', result.accessToken);
    await _prefs?.setString('user_data', jsonEncode(result.user.toJson()));

    notifyListeners();
    return result;
  }

  // ── Logout ──

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
        throw LoginFailure(
          reason: LoginFailureReason.serverError,
          message: 'Session expired. Please log in again.',
        );
      }
      throw LoginFailure(
        reason: LoginFailureReason.serverError,
        message:
            response.body['error'] as String? ??
            'Unable to save favorites right now.',
      );
    }

    _user = AuthUser.fromJson(response.body);
    await _persistSession();
    notifyListeners();
  }

  // ── Forgot Password (mirrors doForgotPassword in Login.tsx) ──

  Future<String> forgotPassword({required String email}) async {
    final response = await _post('/api/auth/forgot-password', {
      'email': email,
    });
    return response.body['message'] as String? ??
        'Password reset link sent to your email.';
  }

  // ── Resend Verification (mirrors doResendVerification in Login.tsx) ──

  Future<String> resendVerification({required String email}) async {
    final response = await _post('/api/auth/resend-verification', {
      'email': email.trim().toLowerCase(),
    });

    if (!response.ok) {
      throw LoginFailure(
        reason: LoginFailureReason.serverError,
        message: response.body['error'] as String? ??
            'Unable to resend verification email.',
      );
    }

    return response.body['message'] as String? ??
        'Verification email resent! Check your inbox.';
  }

  // ── Handle 401 from any protected API call ──

  void handleUnauthorized() {
    logout();
  }

  // ── HTTP helper (mirrors fetch() pattern from the web frontend) ──

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
      if (e is LoginFailure) rethrow;
      throw LoginFailure(
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

class _HttpResponse {
  const _HttpResponse({required this.statusCode, required this.body});
  final int statusCode;
  final Map<String, dynamic> body;
  bool get ok => statusCode >= 200 && statusCode < 300;
}
