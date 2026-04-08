import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config/api_config.dart';
import 'auth_models.dart';
import 'auth_service.dart';

enum _LoginView { form, forgotPassword, resendVerification }

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  _LoginView _loginView = _LoginView.form;
  String _message = '';
  bool _isError = false;
  bool _loading = false;
  bool _forgotSent = false;

  final _loginNameController = TextEditingController();
  final _loginPasswordController = TextEditingController();
  final _emailController = TextEditingController();

  @override
  void dispose() {
    _loginNameController.dispose();
    _loginPasswordController.dispose();
    _emailController.dispose();
    super.dispose();
  }

  void _showSuccess(String msg) => setState(() {
        _isError = false;
        _message = msg;
      });

  void _showError(String msg) => setState(() {
        _isError = true;
        _message = msg;
      });

  void _clearMessage() => setState(() => _message = '');

  // ── LOGIN (mirrors doLogin in Login.tsx) ──

  Future<void> _doLogin() async {
    setState(() => _loading = true);
    try {
      final authService = Provider.of<AuthService>(context, listen: false);
      await authService.login(
        login: _loginNameController.text,
        password: _loginPasswordController.text,
      );
      // On success, AuthService notifies → Consumer in main.dart rebuilds to map
      _clearMessage();
    } on LoginFailure catch (e) {
      if (e.reason == LoginFailureReason.emailNotVerified) {
        setState(() {
          _loginView = _LoginView.resendVerification;
          _emailController.clear();
        });
        _showError(e.message);
        return;
      }
      _showError(e.message);
    } catch (e) {
      _showError('Unable to contact the server');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ── FORGOT PASSWORD (mirrors doForgotPassword in Login.tsx) ──

  Future<void> _doForgotPassword() async {
    if (_emailController.text.trim().isEmpty) {
      _showError('Please enter your email address.');
      return;
    }

    setState(() => _loading = true);
    try {
      final authService = Provider.of<AuthService>(context, listen: false);
      final msg =
          await authService.forgotPassword(email: _emailController.text);
      _showSuccess(msg);
      setState(() => _forgotSent = true);
    } catch (e) {
      _showError('Unable to contact the server');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ── RESEND VERIFICATION (mirrors doResendVerification in Login.tsx) ──

  Future<void> _doResendVerification() async {
    if (_emailController.text.trim().isEmpty) {
      _showError('Please enter your email address.');
      return;
    }

    setState(() => _loading = true);
    try {
      final authService = Provider.of<AuthService>(context, listen: false);
      final msg = await authService.resendVerification(
        email: _emailController.text,
      );
      _showSuccess(msg);
      _emailController.clear();
    } on LoginFailure catch (e) {
      _showError(e.message);
    } catch (e) {
      _showError('Unable to contact the server');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _switchView(_LoginView view) {
    setState(() {
      _loginView = view;
      _message = '';
      _isError = false;
      _forgotSent = false;
    });
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
                const Icon(Icons.location_on, size: 64, color: Color(0xFF0F766E)),
                const SizedBox(height: 8),
                const Text(
                  'Study Space Map',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 32),

                // ── View-dependent content ──
                if (_loginView == _LoginView.form) ..._buildLoginForm(),
                if (_loginView == _LoginView.forgotPassword)
                  ..._buildForgotPasswordForm(),
                if (_loginView == _LoginView.resendVerification)
                  ..._buildResendVerificationForm(),

                // ── Message display (mirrors #loginResult span) ──
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
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ── LOGIN FORM (mirrors loginView === 'form' in Login.tsx) ──

  List<Widget> _buildLoginForm() {
    return [
      const Text('LOG IN',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
      const SizedBox(height: 16),
      TextField(
        controller: _loginNameController,
        decoration: const InputDecoration(
          labelText: 'Username',
          border: OutlineInputBorder(),
        ),
        textInputAction: TextInputAction.next,
      ),
      const SizedBox(height: 12),
      TextField(
        controller: _loginPasswordController,
        obscureText: true,
        decoration: const InputDecoration(
          labelText: 'Password',
          border: OutlineInputBorder(),
        ),
        onSubmitted: (_) => _doLogin(),
      ),
      Align(
        alignment: Alignment.centerRight,
        child: TextButton(
          onPressed: () => _switchView(_LoginView.forgotPassword),
          child: const Text('Forgot Password?'),
        ),
      ),
      const SizedBox(height: 8),
      SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          onPressed: _loading ? null : _doLogin,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF0F766E),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
          child: const Text('Login'),
        ),
      ),
      const SizedBox(height: 16),
      TextButton(
        onPressed: () {
          // Opens the web registration page in the browser
          launchUrl(Uri.parse(webFrontendUrl()));
        },
        child: const Text('Create an account on the web'),
      ),
    ];
  }

  // ── FORGOT PASSWORD FORM (mirrors loginView === 'forgot-password') ──

  List<Widget> _buildForgotPasswordForm() {
    return [
      const Text('FORGOT PASSWORD',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
      const SizedBox(height: 16),
      if (_forgotSent) ...[
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.green.shade50,
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Row(
            children: [
              Icon(Icons.check_circle, color: Colors.green),
              SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Password reset code sent! Check your inbox and use the code to reset your password.',
                ),
              ),
            ],
          ),
        ),
      ] else ...[
        const Text("Enter your email and we'll send you a reset code."),
        const SizedBox(height: 12),
        TextField(
          controller: _emailController,
          keyboardType: TextInputType.emailAddress,
          decoration: const InputDecoration(
            labelText: 'Email Address',
            border: OutlineInputBorder(),
          ),
          onSubmitted: (_) => _doForgotPassword(),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _loading ? null : _doForgotPassword,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0F766E),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            child: const Text('Send Reset Code'),
          ),
        ),
      ],
      const SizedBox(height: 12),
      TextButton(
        onPressed: () => _switchView(_LoginView.form),
        child: const Text('\u2190 Back to Login'),
      ),
    ];
  }

  // ── RESEND VERIFICATION FORM (mirrors loginView === 'resend-verification') ──

  List<Widget> _buildResendVerificationForm() {
    return [
      const Text('VERIFY YOUR EMAIL',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
      const SizedBox(height: 16),
      Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.blue.shade50,
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Row(
          children: [
            Icon(Icons.email, color: Colors.blue),
            SizedBox(width: 12),
            Expanded(
                child: Text(
                  'Your account has not been verified yet. Enter your email below to receive a new verification code.',
                ),
              ),
            ],
        ),
      ),
      const SizedBox(height: 12),
      TextField(
        controller: _emailController,
        keyboardType: TextInputType.emailAddress,
        decoration: const InputDecoration(
          labelText: 'Email Address',
          border: OutlineInputBorder(),
        ),
        onSubmitted: (_) => _doResendVerification(),
      ),
      const SizedBox(height: 12),
      SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          onPressed: _loading ? null : _doResendVerification,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF0F766E),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
          child: const Text('Send Verification Code'),
        ),
      ),
      const SizedBox(height: 12),
      TextButton(
        onPressed: () => _switchView(_LoginView.form),
        child: const Text('\u2190 Back to Login'),
      ),
    ];
  }
}
