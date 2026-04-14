import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

import '../config/api_config.dart';
import 'account_center_models.dart';

const String _configuredAccountCenterAuthToken =
    String.fromEnvironment('ACCOUNT_CENTER_AUTH_TOKEN');
const String _configuredDataCollectionAuthToken =
    String.fromEnvironment('DATA_COLLECTION_AUTH_TOKEN');

String defaultAccountCenterAuthToken() {
  if (_configuredAccountCenterAuthToken.isNotEmpty) {
    return _configuredAccountCenterAuthToken;
  }

  if (_configuredDataCollectionAuthToken.isNotEmpty) {
    return _configuredDataCollectionAuthToken;
  }

  return '';
}

abstract class AccountCenterBackendClient {
  Future<AccountProfileResult> loadProfile();

  Future<AccountProfileResult> updateProfile(AccountProfile profile);

  Future<AccountActionResult> changePassword({
    required String currentPassword,
    required String newPassword,
  });

  Future<AccountActionResult> deleteAccount();
}

class HttpAccountCenterBackendClient implements AccountCenterBackendClient {
  HttpAccountCenterBackendClient({
    String? baseUrl,
    String? authToken,
    this.authTokenProvider,
    this.onUnauthorized,
  })  : _baseUrl = (baseUrl ?? apiBaseUrl()).trim(),
        _explicitAuthToken = (authToken ?? defaultAccountCenterAuthToken()).trim();

  final String _baseUrl;
  final String _explicitAuthToken;
  final String Function()? authTokenProvider;
  final VoidCallback? onUnauthorized;

  String get authToken {
    if (authTokenProvider != null) {
      final token = authTokenProvider!();
      if (token.trim().isNotEmpty) return token.trim();
    }
    return _explicitAuthToken;
  }

  @override
  Future<AccountProfileResult> loadProfile() async {
    _requireAuthToken();

    final response = await _send(path: '/api/auth/profile', method: 'GET');
    final payload = await _decodeJsonMap(response);
    _ensureSuccess(response, payload, fallbackMessage: 'Unable to load profile.');

    return AccountProfileResult(
      profile: _profileFromJson(payload),
      message: 'Profile synced from the backend.',
    );
  }

  @override
  Future<AccountProfileResult> updateProfile(AccountProfile profile) async {
    _requireAuthToken();

    final response = await _sendJson(
      path: '/api/auth/profile',
      method: 'PUT',
      body: <String, dynamic>{
        'firstName': _nullableString(profile.firstName),
        'lastName': _nullableString(profile.lastName),
        'displayName': _nullableString(profile.displayName),
        'pinColor': profile.pinColor,
        'favorites': profile.favorites,
      },
    );
    final payload = await _decodeJsonMap(response);
    _ensureSuccess(
      response,
      payload,
      fallbackMessage: 'Unable to save profile changes.',
    );

    return AccountProfileResult(
      profile: _profileFromJson(payload),
      message: 'Profile changes saved to the backend.',
    );
  }

  @override
  Future<AccountActionResult> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    _requireAuthToken();

    final response = await _sendJson(
      path: '/api/auth/change-password',
      method: 'POST',
      body: <String, dynamic>{
        'currentPassword': currentPassword,
        'newPassword': newPassword,
      },
    );
    final payload = await _decodeJsonMap(response);
    _ensureSuccess(
      response,
      payload,
      fallbackMessage: 'Unable to update password.',
    );

    return AccountActionResult(
      message:
          (payload['message'] as String? ?? 'Password updated successfully.')
              .trim(),
    );
  }

  @override
  Future<AccountActionResult> deleteAccount() async {
    _requireAuthToken();

    final response = await _send(path: '/api/auth/account', method: 'DELETE');
    final payload = await _decodeJsonMap(response);
    _ensureSuccess(
      response,
      payload,
      fallbackMessage: 'Unable to delete account.',
    );

    return AccountActionResult(
      message:
          (payload['message'] as String? ?? 'Account deleted successfully.')
              .trim(),
    );
  }

  String? _nullableString(String? value) {
    final trimmed = (value ?? '').trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  void _requireAuthToken() {
    if (authToken.isEmpty) {
      throw StateError('An auth token is required to call account endpoints.');
    }
  }

  Future<HttpClientResponse> _send({
    required String path,
    required String method,
  }) async {
    final request = await _openRequest(path: path, method: method);
    return request.close();
  }

  Future<HttpClientResponse> _sendJson({
    required String path,
    required String method,
    required Map<String, dynamic> body,
  }) async {
    final request = await _openRequest(path: path, method: method);
    request.headers.contentType = ContentType.json;
    request.write(jsonEncode(body));
    return request.close();
  }

  Future<HttpClientRequest> _openRequest({
    required String path,
    required String method,
  }) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 6);
    final uri = Uri.parse('$_baseUrl$path');
    final request = await client.openUrl(method, uri).timeout(
          const Duration(seconds: 6),
        );
    request.persistentConnection = false;
    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
    request.headers.set(
      HttpHeaders.authorizationHeader,
      'Bearer $authToken',
    );
    return request;
  }

  Future<Map<String, dynamic>> _decodeJsonMap(HttpClientResponse response) async {
    final text = await response.transform(utf8.decoder).join().timeout(
          const Duration(seconds: 6),
        );
    if (text.trim().isEmpty) {
      return <String, dynamic>{};
    }

    return Map<String, dynamic>.from(jsonDecode(text) as Map);
  }

  void _ensureSuccess(
    HttpClientResponse response,
    Map<String, dynamic> payload, {
    required String fallbackMessage,
  }) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return;
    }

    if (response.statusCode == 401) {
      onUnauthorized?.call();
      throw HttpException('Session expired. Please log in again.');
    }

    final message = (payload['error'] as String? ?? fallbackMessage).trim();
    throw HttpException(message.isEmpty ? fallbackMessage : message);
  }

  AccountProfile _profileFromJson(Map<String, dynamic> payload) {
    return AccountProfile(
      userId: (payload['userId'] as String? ?? '').trim(),
      login: (payload['login'] as String? ?? '').trim(),
      email: (payload['email'] as String? ?? '').trim(),
      firstName: _normalizeNullableString(payload['firstName']),
      lastName: _normalizeNullableString(payload['lastName']),
      displayName: _normalizeNullableString(payload['displayName']),
      pinColor: (payload['pinColor'] as String? ?? '#0F766E').trim().toUpperCase(),
      favorites: (payload['favorites'] as List<dynamic>? ?? const <dynamic>[])
          .map((entry) => entry.toString().trim())
          .where((entry) => entry.isNotEmpty)
          .toList(growable: false),
      userNoiseWF: (payload['userNoiseWF'] as num?)?.toDouble() ?? 1.0,
      userOccupancyWF:
          (payload['userOccupancyWF'] as num?)?.toDouble() ?? 1.0,
      passwordChangedAt: _parseDateTime(payload['passwordChangedAt']),
    );
  }

  String? _normalizeNullableString(Object? value) {
    final trimmed = (value as String? ?? '').trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  DateTime? _parseDateTime(Object? value) {
    final raw = (value as String? ?? '').trim();
    if (raw.isEmpty) {
      return null;
    }

    return DateTime.tryParse(raw)?.toLocal();
  }
}
