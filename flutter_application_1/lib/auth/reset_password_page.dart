import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// Mirrors Web_Frontend/src/ResetPassword.tsx
class ResetPasswordPage extends StatefulWidget {
  const ResetPasswordPage({super.key, required this.token});

  final String token;

  @override
  State<ResetPasswordPage> createState() => _ResetPasswordPageState();
}

class _ResetPasswordPageState extends State<ResetPasswordPage> {
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  String _message = '';
  bool _isError = false;
  bool _loading = false;

  @override
  void dispose() {
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  // ── handleReset (mirrors ResetPassword.tsx handleReset) ──

  Future<void> _handleReset() async {
    final newPassword = _newPasswordController.text;
    final confirmPassword = _confirmPasswordController.text;

    if (newPassword.isEmpty || confirmPassword.isEmpty) {
      setState(() {
        _isError = true;
        _message = 'Please fill in both fields.';
      });
      return;
    }

    if (newPassword != confirmPassword) {
      setState(() {
        _isError = true;
        _message = 'Passwords do not match.';
      });
      return;
    }

    setState(() => _loading = true);

    try {
      final baseUrl = _resolveBaseUrl();
      final client = HttpClient()
        ..connectionTimeout = const Duration(seconds: 6);
      final uri = Uri.parse('$baseUrl/api/auth/reset-password');
      final request = await client.postUrl(uri).timeout(
            const Duration(seconds: 6),
          );
      request.persistentConnection = false;
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode({
        'token': widget.token,
        'newPassword': newPassword,
      }));

      final response = await request.close();
      final text = await response.transform(utf8.decoder).join().timeout(
            const Duration(seconds: 6),
          );
      final res = text.trim().isEmpty
          ? <String, dynamic>{}
          : Map<String, dynamic>.from(jsonDecode(text) as Map);

      client.close(force: true);

      if (response.statusCode < 200 || response.statusCode >= 300) {
        setState(() {
          _isError = true;
          _message = res['error'] as String? ??
              'Reset failed. Your token may have expired.';
        });
        return;
      }

      setState(() {
        _isError = false;
        _message =
            'Password reset successful! Redirecting to login in 3 seconds...';
      });

      await Future<void>.delayed(const Duration(seconds: 3));
      if (mounted) {
        Navigator.of(context).pushNamedAndRemoveUntil('/login', (_) => false);
      }
    } catch (e) {
      setState(() {
        _isError = true;
        _message = 'Unable to contact the server';
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _resolveBaseUrl() {
    const configured = String.fromEnvironment('ACCOUNT_CENTER_API_BASE_URL');
    if (configured.isNotEmpty) return configured;
    const configured2 = String.fromEnvironment('DATA_COLLECTION_API_BASE_URL');
    if (configured2.isNotEmpty) return configured2;
    if (kIsWeb) return 'http://localhost:5050';
    if (Platform.isAndroid) return 'http://10.0.2.2:5050';
    return 'http://localhost:5050';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('RESET PASSWORD',
                    style:
                        TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                const SizedBox(height: 16),
                const Text('Enter your new password below.'),
                const SizedBox(height: 12),
                TextField(
                  controller: _newPasswordController,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'New Password',
                    border: OutlineInputBorder(),
                  ),
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _confirmPasswordController,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Confirm New Password',
                    border: OutlineInputBorder(),
                  ),
                  onSubmitted: (_) => _handleReset(),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _loading ? null : _handleReset,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF0F766E),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: const Text('Reset Password'),
                  ),
                ),
                if (_message.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: _isError
                          ? Colors.red.shade50
                          : Colors.green.shade50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: _isError ? Colors.red : Colors.green,
                      ),
                    ),
                    child: Text(
                      _message,
                      style: TextStyle(
                        color: _isError
                            ? Colors.red.shade800
                            : Colors.green.shade800,
                      ),
                    ),
                  ),
                ],
                if (_loading) ...[
                  const SizedBox(height: 16),
                  const CircularProgressIndicator(),
                ],
                const SizedBox(height: 12),
                TextButton(
                  onPressed: () {
                    Navigator.of(context)
                        .pushNamedAndRemoveUntil('/login', (_) => false);
                  },
                  child: const Text('\u2190 Back to Login'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
