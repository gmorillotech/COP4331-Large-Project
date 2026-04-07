import 'dart:io';

import 'package:flutter/foundation.dart';

/// Single compile-time override for the backend API base URL.
///
/// Local dev (default):  omit the flag → resolves to localhost.
/// Production build:     flutter build --dart-define=API_BASE_URL=http://167.71.81.89:5050
const String _apiBaseUrl = String.fromEnvironment('API_BASE_URL');

/// Single compile-time override for the web frontend URL.
///
/// Local dev (default):  omit the flag → http://localhost:5173
/// Production build:     flutter build --dart-define=WEB_FRONTEND_URL=http://167.71.81.89
const String _webFrontendUrl = String.fromEnvironment('WEB_FRONTEND_URL');

/// Returns the API base URL for the current environment.
String apiBaseUrl() {
  if (_apiBaseUrl.isNotEmpty) return _apiBaseUrl;
  if (kIsWeb) return 'http://localhost:5050';
  if (Platform.isAndroid) return 'http://10.0.2.2:5050';
  return 'http://localhost:5050';
}

/// Returns the web frontend URL for the current environment.
String webFrontendUrl() {
  if (_webFrontendUrl.isNotEmpty) return _webFrontendUrl;
  return 'http://localhost:5173';
}
