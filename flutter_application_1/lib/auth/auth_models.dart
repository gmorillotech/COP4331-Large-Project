List<String> validateUsername(String username) {
  final errors = <String>[];
  if (username.length < 3 || username.length > 22) {
    errors.add('3\u201322 characters');
  }
  if (!RegExp(r'[a-zA-Z]').hasMatch(username)) {
    errors.add('at least one letter');
  }
  return errors;
}

List<String> validatePassword(String password) {
  final errors = <String>[];
  if (password.length < 8) errors.add('at least 8 characters');
  if (!RegExp(r'[a-zA-Z]').hasMatch(password)) errors.add('at least one letter');
  if (!RegExp(r'[0-9]').hasMatch(password)) errors.add('at least one number');
  if (!RegExp(r'[^a-zA-Z0-9]').hasMatch(password)) {
    errors.add('at least one special character');
  }
  return errors;
}

class AuthUser {
  const AuthUser({
    required this.userId,
    required this.login,
    required this.email,
    this.firstName,
    this.lastName,
    this.displayName,
    this.favorites = const [],
    this.userNoiseWF = 1.0,
    this.userOccupancyWF = 1.0,
    this.role = 'user',
    this.accountStatus = 'active',
  });

  final String userId;
  final String login;
  final String email;
  final String? firstName;
  final String? lastName;
  final String? displayName;
  final List<String> favorites;
  final double userNoiseWF;
  final double userOccupancyWF;
  final String role;
  final String accountStatus;

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      userId: json['userId'] as String? ?? '',
      login: json['login'] as String? ?? '',
      email: json['email'] as String? ?? '',
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      displayName: json['displayName'] as String?,
      favorites: (json['favorites'] as List<dynamic>?)?.cast<String>() ?? [],
      userNoiseWF: (json['userNoiseWF'] as num?)?.toDouble() ?? 1.0,
      userOccupancyWF: (json['userOccupancyWF'] as num?)?.toDouble() ?? 1.0,
      role: json['role'] as String? ?? 'user',
      accountStatus: json['accountStatus'] as String? ?? 'active',
    );
  }

  Map<String, dynamic> toJson() => {
        'userId': userId,
        'login': login,
        'email': email,
        'firstName': firstName,
        'lastName': lastName,
        'displayName': displayName,
        'favorites': favorites,
        'userNoiseWF': userNoiseWF,
        'userOccupancyWF': userOccupancyWF,
        'role': role,
        'accountStatus': accountStatus,
      };
}

class LoginResult {
  const LoginResult({required this.accessToken, required this.user});

  final String accessToken;
  final AuthUser user;

  factory LoginResult.fromJson(Map<String, dynamic> json) {
    return LoginResult(
      accessToken: json['accessToken'] as String,
      user: AuthUser.fromJson(json['user'] as Map<String, dynamic>),
    );
  }
}

class RegisterResult {
  const RegisterResult({
    required this.userId,
    required this.login,
    required this.email,
    required this.message,
    this.maskedEmail,
  });

  final String userId;
  final String login;
  final String email;
  final String message;
  final String? maskedEmail;

  factory RegisterResult.fromJson(Map<String, dynamic> json) {
    return RegisterResult(
      userId: json['userId'] as String? ?? '',
      login: json['login'] as String? ?? '',
      email: json['email'] as String? ?? '',
      message: json['message'] as String? ?? '',
      maskedEmail: json['maskedEmail'] as String?,
    );
  }
}

class VerificationDelivery {
  const VerificationDelivery({
    required this.message,
    required this.email,
    this.maskedEmail,
  });

  final String message;
  final String email;
  final String? maskedEmail;

  factory VerificationDelivery.fromJson(Map<String, dynamic> json) {
    return VerificationDelivery(
      message: json['message'] as String? ?? '',
      email: json['email'] as String? ?? '',
      maskedEmail: json['maskedEmail'] as String?,
    );
  }
}

class VerificationResult {
  const VerificationResult({
    required this.message,
    this.requiresPasswordReset = false,
    this.email,
    this.maskedEmail,
  });

  final String message;
  final bool requiresPasswordReset;
  final String? email;
  final String? maskedEmail;
}

class ForgotPasswordResult {
  const ForgotPasswordResult({
    required this.message,
    this.email,
    this.maskedEmail,
  });

  final String message;
  final String? email;
  final String? maskedEmail;
}

enum LoginFailureReason {
  invalidCredentials,
  emailNotVerified,
  forcedReset,
  forcedResetVerify,
  serverError,
  networkError,
}

class LoginFailure implements Exception {
  const LoginFailure({
    required this.reason,
    required this.message,
    this.email,
    this.maskedEmail,
    this.requiresPasswordReset = false,
  });

  final LoginFailureReason reason;
  final String message;
  final String? email;
  final String? maskedEmail;
  final bool requiresPasswordReset;

  @override
  String toString() => 'LoginFailure($reason): $message';
}
