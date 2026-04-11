import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../auth/auth_models.dart';
import '../auth/auth_service.dart';
import '../data_collection/data_collection_workflow.dart';
import 'account_center_backend.dart';
import 'account_center_models.dart';

class AccountCenterPage extends StatefulWidget {
  const AccountCenterPage({
    super.key,
    this.backendClient,
    this.favoriteSuggestions = seededStudyLocations,
  });

  final AccountCenterBackendClient? backendClient;
  final List<DataCollectionStudyLocation> favoriteSuggestions;

  @override
  State<AccountCenterPage> createState() => _AccountCenterPageState();
}

class _AccountCenterPageState extends State<AccountCenterPage> {
  static const List<_PinColorOption> _pinColorOptions = <_PinColorOption>[
    _PinColorOption('Deep Teal', '#0F766E'),
    _PinColorOption('Ocean Blue', '#2563EB'),
    _PinColorOption('Sunset Orange', '#EA580C'),
    _PinColorOption('Berry Red', '#BE123C'),
    _PinColorOption('Forest Green', '#15803D'),
    _PinColorOption('Golden Amber', '#B45309'),
  ];

  late final AccountCenterBackendClient _backendClient;
  final TextEditingController _firstNameController = TextEditingController();
  final TextEditingController _lastNameController = TextEditingController();
  final TextEditingController _displayNameController = TextEditingController();
  final TextEditingController _favoriteInputController =
      TextEditingController();
  final TextEditingController _currentPasswordController =
      TextEditingController();
  final TextEditingController _newPasswordController = TextEditingController();
  final TextEditingController _confirmPasswordController =
      TextEditingController();

  AccountProfile? _profile;
  AccountSyncMode _syncMode = AccountSyncMode.localFallback;
  bool _loading = true;
  bool _savingProfile = false;
  bool _changingPassword = false;
  List<String> _favorites = <String>[];
  String _pinColor = _pinColorOptions.first.hex;
  String? _message;
  bool _messageIsError = false;

  Map<String, String> get _favoriteLabelMap => {
        for (final location in widget.favoriteSuggestions)
          location.studyLocationId: location.displayLabel,
      };

  bool _initialized = false;

  @override
  void initState() {
    super.initState();
    if (widget.backendClient != null) {
      _backendClient = widget.backendClient!;
      _initialized = true;
      _loadProfile();
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_initialized) {
      _backendClient = _buildAuthAwareClient();
      _initialized = true;
      _loadProfile();
    }
  }

  @override
  void dispose() {
    _firstNameController.dispose();
    _lastNameController.dispose();
    _displayNameController.dispose();
    _favoriteInputController.dispose();
    _currentPasswordController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  AccountCenterBackendClient _buildAuthAwareClient() {
    final authService = Provider.of<AuthService>(context, listen: false);
    return HybridAccountCenterBackendClient(
      remoteClient: HttpAccountCenterBackendClient(
        authTokenProvider: () => authService.token ?? '',
        onUnauthorized: () => authService.handleUnauthorized(),
      ),
    );
  }

  Future<void> _loadProfile({String? statusMessage}) async {
    setState(() {
      _loading = true;
      _message = null;
    });

    try {
      final result = await _backendClient.loadProfile();
      if (!mounted) {
        return;
      }

      _applyProfile(
        result.profile,
        mode: result.mode,
        message: statusMessage ?? result.message,
        isError: false,
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _loading = false;
        _message = _readableError(error);
        _messageIsError = true;
      });
    }
  }

  void _applyProfile(
    AccountProfile profile, {
    required AccountSyncMode mode,
    required String message,
    required bool isError,
  }) {
    _firstNameController.text = profile.firstName ?? '';
    _lastNameController.text = profile.lastName ?? '';
    _displayNameController.text = profile.displayName ?? '';

    setState(() {
      _profile = profile;
      _syncMode = mode;
      _favorites = List<String>.from(profile.favorites);
      _pinColor = profile.pinColor.toUpperCase();
      _loading = false;
      _message = message;
      _messageIsError = isError;
    });

    try {
      final authService = Provider.of<AuthService>(context, listen: false);
      unawaited(authService.setCachedFavorites(profile.favorites));
    } on ProviderNotFoundException {
      // Some isolated tests mount this page without the app-level auth provider.
    }
  }

  Future<void> _saveProfile() async {
    final profile = _profile;
    if (profile == null || _savingProfile) {
      return;
    }

    setState(() {
      _savingProfile = true;
      _message = null;
    });

    final nextProfile = profile.copyWith(
      firstName: _nullableText(_firstNameController.text),
      lastName: _nullableText(_lastNameController.text),
      displayName: _nullableText(_displayNameController.text),
      pinColor: _pinColor,
      favorites: _favorites,
    );

    try {
      final result = await _backendClient.updateProfile(nextProfile);
      if (!mounted) {
        return;
      }

      _applyProfile(
        result.profile,
        mode: result.mode,
        message: result.message,
        isError: false,
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _message = _readableError(error);
        _messageIsError = true;
      });
    } finally {
      if (mounted) {
        setState(() => _savingProfile = false);
      }
    }
  }

  Future<void> _changePassword() async {
    if (_changingPassword) {
      return;
    }

    final currentPassword = _currentPasswordController.text;
    final newPassword = _newPasswordController.text;
    final confirmPassword = _confirmPasswordController.text;

    if (currentPassword.trim().isEmpty) {
      _showInlineMessage(
        'Enter your current password before saving a new one.',
        isError: true,
      );
      return;
    }

    final passwordErrors = validatePassword(newPassword);
    if (passwordErrors.isNotEmpty) {
      _showInlineMessage(
        'Password must have ${passwordErrors.join(', ')}.',
        isError: true,
      );
      return;
    }

    if (newPassword != confirmPassword) {
      _showInlineMessage(
        'New password and confirmation do not match.',
        isError: true,
      );
      return;
    }

    setState(() {
      _changingPassword = true;
      _message = null;
    });

    try {
      final result = await _backendClient.changePassword(
        currentPassword: currentPassword,
        newPassword: newPassword,
      );
      if (!mounted) {
        return;
      }

      _currentPasswordController.clear();
      _newPasswordController.clear();
      _confirmPasswordController.clear();
      setState(() => _changingPassword = false);
      await _loadProfile(statusMessage: result.message);
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _message = _readableError(error);
        _messageIsError = true;
        _changingPassword = false;
      });
    }
  }

  String? _nullableText(String value) {
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  String _readableError(Object error) {
    final raw = error.toString();
    return raw.startsWith('Bad state: ') ? raw.substring(11) : raw;
  }

  void _showInlineMessage(String message, {required bool isError}) {
    setState(() {
      _message = message;
      _messageIsError = isError;
    });
  }

  void _addFavorite(String value) {
    final normalized = value.trim();
    if (normalized.isEmpty) {
      return;
    }

    if (_favorites.contains(normalized)) {
      _showInlineMessage('That favorite is already listed.', isError: true);
      return;
    }

    setState(() {
      _favorites = <String>[..._favorites, normalized];
      _favoriteInputController.clear();
      _message = null;
    });
  }

  void _removeFavorite(String favorite) {
    setState(() {
      _favorites = _favorites.where((entry) => entry != favorite).toList();
    });
  }

  Future<void> _logout() async {
    final shouldLogout = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Log out?'),
          content: const Text(
            'This will clear the saved session on this device and return to the login screen.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text('Log out'),
            ),
          ],
        );
      },
    );

    if (shouldLogout != true || !mounted) {
      return;
    }

    await Provider.of<AuthService>(context, listen: false).logout();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final profile = _profile;

    return Scaffold(
      backgroundColor: const Color(0xFFF7F3EC),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: const Text('Account Center'),
        actions: [
          IconButton(
            tooltip: 'Refresh account data',
            onPressed: _loading ? null : _loadProfile,
            icon: const Icon(Icons.refresh_rounded),
          ),
          IconButton(
            tooltip: 'Log out',
            onPressed: _logout,
            icon: const Icon(Icons.logout_rounded),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : profile == null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      'We could not load account details for this app session.',
                      style: theme.textTheme.titleMedium,
                      textAlign: TextAlign.center,
                    ),
                  ),
                )
              : DecoratedBox(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: <Color>[
                        Color(0xFFFFF8EE),
                        Color(0xFFE9F7F2),
                        Color(0xFFFDF2E2),
                      ],
                    ),
                  ),
                  child: SafeArea(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _heroCard(profile),
                          if (_message != null && _message!.trim().isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 12),
                              child: _messageBanner(_message!, _messageIsError),
                            ),
                          const SizedBox(height: 16),
                          _sectionCard(
                            title: 'General',
                            subtitle:
                                'Identity details and account information tied to your profile.',
                            trailing: FilledButton.tonalIcon(
                              key: const Key('general-save-button'),
                              onPressed: _savingProfile ? null : _saveProfile,
                              icon: const Icon(Icons.save_outlined),
                              label: Text(
                                _savingProfile ? 'Saving...' : 'Save Profile',
                              ),
                            ),
                            child: Column(
                              children: [
                                _editableField(
                                  controller: _firstNameController,
                                  label: 'First name',
                                  keyName: 'first-name-field',
                                ),
                                const SizedBox(height: 12),
                                _editableField(
                                  controller: _lastNameController,
                                  label: 'Last name',
                                  keyName: 'last-name-field',
                                ),
                                const SizedBox(height: 12),
                                _editableField(
                                  controller: _displayNameController,
                                  label: 'Display name',
                                  keyName: 'display-name-field',
                                ),
                                const SizedBox(height: 12),
                                _readOnlyField(
                                  label: 'Username',
                                  value: profile.login,
                                ),
                                const SizedBox(height: 12),
                                _readOnlyField(
                                  label: 'Email',
                                  value: profile.email,
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          _sectionCard(
                            title: 'Color Choice',
                            subtitle:
                                'Choose the pin color that represents you on the study-space map.',
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Wrap(
                                  spacing: 12,
                                  runSpacing: 12,
                                  children: _pinColorOptions.map((option) {
                                    final selected =
                                        option.hex.toUpperCase() == _pinColor;
                                    return InkWell(
                                      key: Key('color-swatch-${option.hex}'),
                                      borderRadius: BorderRadius.circular(20),
                                      onTap: () {
                                        setState(() {
                                          _pinColor = option.hex.toUpperCase();
                                        });
                                      },
                                      child: AnimatedContainer(
                                        duration:
                                            const Duration(milliseconds: 180),
                                        width: 104,
                                        padding: const EdgeInsets.all(12),
                                        decoration: BoxDecoration(
                                          color: Colors.white,
                                          borderRadius:
                                              BorderRadius.circular(20),
                                          border: Border.all(
                                            color: selected
                                                ? _colorFromHex(option.hex)
                                                : const Color(0xFFD6D3D1),
                                            width: selected ? 2.6 : 1.2,
                                          ),
                                          boxShadow: selected
                                              ? [
                                                  BoxShadow(
                                                    color: _colorFromHex(
                                                      option.hex,
                                                    ).withValues(alpha: 0.22),
                                                    blurRadius: 18,
                                                    offset: const Offset(0, 8),
                                                  ),
                                                ]
                                              : null,
                                        ),
                                        child: Column(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            CircleAvatar(
                                              radius: 18,
                                              backgroundColor:
                                                  _colorFromHex(option.hex),
                                            ),
                                            const SizedBox(height: 8),
                                            Text(
                                              option.label,
                                              textAlign: TextAlign.center,
                                              style: const TextStyle(
                                                fontWeight: FontWeight.w700,
                                                color: Color(0xFF292524),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    );
                                  }).toList(growable: false),
                                ),
                                const SizedBox(height: 16),
                                Container(
                                  padding: const EdgeInsets.all(16),
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(24),
                                    border: Border.all(
                                      color: const Color(0xFFE7E5E4),
                                    ),
                                  ),
                                  child: Row(
                                    children: [
                                      CircleAvatar(
                                        radius: 26,
                                        backgroundColor:
                                            _colorFromHex(_pinColor),
                                        foregroundColor: Colors.white,
                                        child: Text(
                                          profile.initials,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 16),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            const Text(
                                              'Active pin preview',
                                              style: TextStyle(
                                                fontWeight: FontWeight.w800,
                                                color: Color(0xFF292524),
                                              ),
                                            ),
                                            const SizedBox(height: 4),
                                            Text(
                                              'Your selected pin color is $_pinColor.',
                                              style: const TextStyle(
                                                color: Color(0xFF57534E),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          _sectionCard(
                            title: 'Preferences',
                            subtitle:
                                'Favorite study spots and trust-factor telemetry from report processing.',
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'Favorite Spots',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w800,
                                    color: Color(0xFF292524),
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: _favorites.isEmpty
                                      ? const <Widget>[
                                          Text(
                                            'No favorite spots selected yet.',
                                            style: TextStyle(
                                              color: Color(0xFF78716C),
                                            ),
                                          ),
                                        ]
                                      : _favorites.map((favorite) {
                                          return Chip(
                                            label: Text(
                                              _favoriteLabelMap[favorite] ??
                                                  favorite,
                                            ),
                                            onDeleted: () =>
                                                _removeFavorite(favorite),
                                          );
                                        }).toList(growable: false),
                                ),
                                const SizedBox(height: 12),
                                Row(
                                  children: [
                                    Expanded(
                                      child: TextField(
                                        key: const Key('favorite-input'),
                                        controller: _favoriteInputController,
                                        decoration: InputDecoration(
                                          labelText:
                                              'Add favorite by location id',
                                          hintText:
                                              'library-floor-1-quiet',
                                          filled: true,
                                          fillColor: Colors.white,
                                          border: OutlineInputBorder(
                                            borderRadius:
                                                BorderRadius.circular(18),
                                          ),
                                        ),
                                        onSubmitted: _addFavorite,
                                      ),
                                    ),
                                    const SizedBox(width: 10),
                                    FilledButton.tonal(
                                      key: const Key('add-favorite-button'),
                                      onPressed: () => _addFavorite(
                                        _favoriteInputController.text,
                                      ),
                                      child: const Text('Add'),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: widget.favoriteSuggestions
                                      .where(
                                        (location) => !_favorites.contains(
                                          location.studyLocationId,
                                        ),
                                      )
                                      .map(
                                        (location) => ActionChip(
                                          label:
                                              Text(location.displayLabel),
                                          onPressed: () => _addFavorite(
                                            location.studyLocationId,
                                          ),
                                        ),
                                      )
                                      .toList(growable: false),
                                ),
                                const SizedBox(height: 18),
                                _trustFactorTile(
                                  label: 'Noise trust factor',
                                  value: profile.userNoiseWF,
                                  accent: const Color(0xFF0F766E),
                                ),
                                const SizedBox(height: 12),
                                _trustFactorTile(
                                  label: 'Occupancy trust factor',
                                  value: profile.userOccupancyWF,
                                  accent: const Color(0xFFB45309),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          _sectionCard(
                            title: 'Security Preferences',
                            subtitle:
                                'Review password activity and change your password safely.',
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                _securitySummary(profile),
                                const SizedBox(height: 16),
                                _editableField(
                                  controller: _currentPasswordController,
                                  label: 'Current password',
                                  keyName: 'current-password-field',
                                  obscureText: true,
                                ),
                                const SizedBox(height: 12),
                                _editableField(
                                  controller: _newPasswordController,
                                  label: 'New password',
                                  keyName: 'new-password-field',
                                  obscureText: true,
                                ),
                                const SizedBox(height: 12),
                                _editableField(
                                  controller: _confirmPasswordController,
                                  label: 'Confirm new password',
                                  keyName: 'confirm-password-field',
                                  obscureText: true,
                                ),
                                const SizedBox(height: 14),
                                FilledButton.icon(
                                  key: const Key('security-submit-button'),
                                  onPressed:
                                      _changingPassword ? null : _changePassword,
                                  icon: const Icon(Icons.lock_outline_rounded),
                                  label: Text(
                                    _changingPassword
                                        ? 'Updating...'
                                        : 'Update Password',
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
    );
  }

  Widget _heroCard(AccountProfile profile) {
    final syncLabel = _syncMode == AccountSyncMode.remote
        ? 'Live backend sync'
        : 'Local preview mode';

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: <Color>[
            _colorFromHex(_pinColor).withValues(alpha: 0.92),
            const Color(0xFF1C1917),
          ],
        ),
        borderRadius: BorderRadius.circular(28),
        boxShadow: [
          BoxShadow(
            color: _colorFromHex(_pinColor).withValues(alpha: 0.24),
            blurRadius: 28,
            offset: const Offset(0, 14),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 28,
                backgroundColor: Colors.white.withValues(alpha: 0.22),
                foregroundColor: Colors.white,
                child: Text(
                  profile.initials,
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 18,
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      profile.resolvedDisplayName,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 24,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      profile.email,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.82),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _heroPill(label: 'User ID', value: profile.userId),
              _heroPill(label: 'Favorites', value: '${_favorites.length} saved'),
              _heroPill(
                label: 'Sync',
                value: syncLabel,
                key: const Key('sync-mode-chip'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _heroPill({
    required String label,
    required String value,
    Key? key,
  }) {
    return Container(
      key: key,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.76),
              fontWeight: FontWeight.w700,
              fontSize: 11,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  Widget _messageBanner(String message, bool isError) {
    final color = isError ? const Color(0xFFB91C1C) : const Color(0xFF0F766E);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: color.withValues(alpha: 0.24)),
      ),
      child: Row(
        children: [
          Icon(
            isError ? Icons.error_outline_rounded : Icons.check_circle_outline,
            color: color,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionCard({
    required String title,
    required String subtitle,
    required Widget child,
    Widget? trailing,
  }) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: const Color(0xFFE7E5E4)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x14000000),
            blurRadius: 22,
            offset: Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF1C1917),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        color: Color(0xFF57534E),
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              if (trailing != null) ...[
                const SizedBox(width: 12),
                trailing,
              ],
            ],
          ),
          const SizedBox(height: 18),
          child,
        ],
      ),
    );
  }

  Widget _editableField({
    required TextEditingController controller,
    required String label,
    required String keyName,
    bool obscureText = false,
  }) {
    return TextField(
      key: Key(keyName),
      controller: controller,
      obscureText: obscureText,
      decoration: InputDecoration(
        labelText: label,
        filled: true,
        fillColor: const Color(0xFFFFFBF5),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
        ),
      ),
    );
  }

  Widget _readOnlyField({
    required String label,
    required String value,
  }) {
    return TextFormField(
      initialValue: value,
      enabled: false,
      decoration: InputDecoration(
        labelText: label,
        filled: true,
        fillColor: const Color(0xFFF5F5F4),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
        ),
      ),
    );
  }

  Widget _trustFactorTile({
    required String label,
    required double value,
    required Color accent,
  }) {
    final normalized = ((value - 0.5) / 1.0).clamp(0.0, 1.0);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFBF5),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF292524),
                  ),
                ),
              ),
              Text(
                value.toStringAsFixed(2),
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  color: accent,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: normalized,
              minHeight: 10,
              backgroundColor: const Color(0xFFE7E5E4),
              valueColor: AlwaysStoppedAnimation<Color>(accent),
            ),
          ),
        ],
      ),
    );
  }

  Widget _securitySummary(AccountProfile profile) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFBF5),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Security snapshot',
            style: TextStyle(
              fontWeight: FontWeight.w800,
              color: Color(0xFF1C1917),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            profile.passwordChangedAt == null
                ? 'No password change timestamp is available for this profile yet.'
                : 'Last password update: ${_formatDate(profile.passwordChangedAt!)}',
            style: const TextStyle(
              color: Color(0xFF57534E),
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            _syncMode == AccountSyncMode.remote
                ? 'Changes here are sent to the backend immediately.'
                : 'You are editing the local preview profile for this app session.',
            style: const TextStyle(
              color: Color(0xFF78716C),
            ),
          ),
        ],
      ),
    );
  }

  String _formatDate(DateTime dateTime) {
    final local = dateTime.toLocal();
    final month = local.month.toString().padLeft(2, '0');
    final day = local.day.toString().padLeft(2, '0');
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');
    return '${local.year}-$month-$day at $hour:$minute';
  }
}

class _PinColorOption {
  const _PinColorOption(this.label, this.hex);

  final String label;
  final String hex;
}

Color _colorFromHex(String hex) {
  final normalized = hex.replaceFirst('#', '');
  final value = normalized.length == 6 ? 'FF$normalized' : normalized;
  return Color(int.parse(value, radix: 16));
}
