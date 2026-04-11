import 'package:flutter/foundation.dart';

enum AccountSyncMode {
  remote,
  localFallback,
}

@immutable
class AccountProfile {
  const AccountProfile({
    required this.userId,
    required this.login,
    required this.email,
    required this.firstName,
    required this.lastName,
    required this.displayName,
    required this.pinColor,
    required this.favorites,
    required this.userNoiseWF,
    required this.userOccupancyWF,
    this.passwordChangedAt,
  });

  final String userId;
  final String login;
  final String email;
  final String? firstName;
  final String? lastName;
  final String? displayName;
  final String pinColor;
  final List<String> favorites;
  final double userNoiseWF;
  final double userOccupancyWF;
  final DateTime? passwordChangedAt;

  String get resolvedDisplayName {
    final trimmedDisplay = (displayName ?? '').trim();
    if (trimmedDisplay.isNotEmpty) {
      return trimmedDisplay;
    }

    final fullName = [firstName, lastName]
        .whereType<String>()
        .map((value) => value.trim())
        .where((value) => value.isNotEmpty)
        .join(' ');
    if (fullName.isNotEmpty) {
      return fullName;
    }

    if (login.trim().isNotEmpty) {
      return login.trim();
    }

    return 'Study Space User';
  }

  String get initials {
    final source = resolvedDisplayName
        .split(RegExp(r'\s+'))
        .where((part) => part.trim().isNotEmpty)
        .take(2)
        .map((part) => part.trim()[0].toUpperCase())
        .join();
    return source.isEmpty ? 'U' : source;
  }

  AccountProfile copyWith({
    String? userId,
    String? login,
    String? email,
    String? firstName,
    String? lastName,
    String? displayName,
    String? pinColor,
    List<String>? favorites,
    double? userNoiseWF,
    double? userOccupancyWF,
    DateTime? passwordChangedAt,
  }) {
    return AccountProfile(
      userId: userId ?? this.userId,
      login: login ?? this.login,
      email: email ?? this.email,
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      displayName: displayName ?? this.displayName,
      pinColor: pinColor ?? this.pinColor,
      favorites: favorites ?? this.favorites,
      userNoiseWF: userNoiseWF ?? this.userNoiseWF,
      userOccupancyWF: userOccupancyWF ?? this.userOccupancyWF,
      passwordChangedAt: passwordChangedAt ?? this.passwordChangedAt,
    );
  }
}

@immutable
class AccountProfileResult {
  const AccountProfileResult({
    required this.profile,
    required this.mode,
    required this.message,
  });

  final AccountProfile profile;
  final AccountSyncMode mode;
  final String message;
}

@immutable
class AccountActionResult {
  const AccountActionResult({
    required this.mode,
    required this.message,
  });

  final AccountSyncMode mode;
  final String message;
}

AccountProfile buildDemoAccountProfile() {
  return AccountProfile(
    userId: 'local-user',
    login: 'local-user',
    email: 'local-user@example.com',
    firstName: 'Local',
    lastName: 'User',
    displayName: 'Study Explorer',
    pinColor: '#0F766E',
    favorites: const <String>[
      'library-floor-1-quiet',
      'library-floor-4-empty',
    ],
    userNoiseWF: 1.0,
    userOccupancyWF: 1.0,
    passwordChangedAt: DateTime.now().subtract(const Duration(days: 14)),
  );
}
