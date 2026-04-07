import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';

import '../config/api_config.dart';

/// Screen that verifies a user's email via the token from the deep link.
class VerifyEmailPage extends StatefulWidget {
  const VerifyEmailPage({super.key, required this.token});

  final String token;

  @override
  State<VerifyEmailPage> createState() => _VerifyEmailPageState();
}

class _VerifyEmailPageState extends State<VerifyEmailPage> {
  bool _loading = true;
  bool _isError = false;
  String _message = '';

  @override
  void initState() {
    super.initState();
    _verifyEmail();
  }

  Future<void> _verifyEmail() async {
    try {
      final baseUrl = apiBaseUrl();
      final client = HttpClient()
        ..connectionTimeout = const Duration(seconds: 6);
      final uri = Uri.parse('$baseUrl/api/auth/verify-email');
      final request = await client.postUrl(uri).timeout(
            const Duration(seconds: 6),
          );
      request.persistentConnection = false;
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode({'token': widget.token}));

      final response = await request.close();
      final text = await response.transform(utf8.decoder).join().timeout(
            const Duration(seconds: 6),
          );
      final res = text.trim().isEmpty
          ? <String, dynamic>{}
          : Map<String, dynamic>.from(jsonDecode(text) as Map);

      client.close(force: true);

      if (!mounted) return;

      if (response.statusCode < 200 || response.statusCode >= 300) {
        setState(() {
          _isError = true;
          _message = res['error'] as String? ??
              'Invalid or expired verification token.';
        });
        return;
      }

      setState(() {
        _isError = false;
        _message =
            'Your email has been verified successfully. You can now log in.';
      });
    } catch (_) {
      setState(() {
        _isError = true;
        _message = 'Unable to contact the server.';
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _goToLogin() {
    Navigator.of(context).pushNamedAndRemoveUntil('/login', (route) => false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Email Verification')),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: _loading ? _buildLoading() : _buildResult(),
          ),
        ),
      ),
    );
  }

  Widget _buildLoading() {
    return const Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        CircularProgressIndicator(),
        SizedBox(height: 16),
        Text('Verifying your email...'),
      ],
    );
  }

  Widget _buildResult() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          _isError ? 'VERIFICATION FAILED' : 'EMAIL VERIFIED!',
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 16),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: _isError ? Colors.red.shade50 : Colors.green.shade50,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: _isError ? Colors.red : Colors.green,
            ),
          ),
          child: Text(
            _message,
            style: TextStyle(
              color:
                  _isError ? Colors.red.shade800 : Colors.green.shade800,
            ),
          ),
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _goToLogin,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0F766E),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            child: const Text('Go to Login'),
          ),
        ),
        if (_isError) ...[
          const SizedBox(height: 12),
          TextButton(
            onPressed: _goToLogin,
            child: const Text('Resend Verification Email'),
          ),
        ],
      ],
    );
  }
}
