import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'auth_models.dart';
import 'auth_service.dart';

enum _AuthTab { login, register }

enum _SubView { none, forgotPassword, resendVerification, registerSuccess }

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  _AuthTab _activeTab = _AuthTab.login;
  _SubView _subView = _SubView.none;
  String _message = '';
  bool _isError = false;
  bool _loading = false;
  bool _forgotSent = false;

  // Login controllers
  final _loginNameController = TextEditingController();
  final _loginPasswordController = TextEditingController();

  // Shared email controller (forgot-password & resend-verification)
  final _emailController = TextEditingController();

  // Registration controllers
  final _regFirstNameController = TextEditingController();
  final _regLastNameController = TextEditingController();
  final _regDisplayNameController = TextEditingController();
  final _regEmailController = TextEditingController();
  final _regUsernameController = TextEditingController();
  final _regPasswordController = TextEditingController();

  @override
  void dispose() {
    _loginNameController.dispose();
    _loginPasswordController.dispose();
    _emailController.dispose();
    _regFirstNameController.dispose();
    _regLastNameController.dispose();
    _regDisplayNameController.dispose();
    _regEmailController.dispose();
    _regUsernameController.dispose();
    _regPasswordController.dispose();
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

  void _switchTab(_AuthTab tab) {
    setState(() {
      _activeTab = tab;
      _subView = _SubView.none;
      _message = '';
      _isError = false;
      _forgotSent = false;
    });
  }

  void _switchSubView(_SubView view) {
    setState(() {
      _subView = view;
      _message = '';
      _isError = false;
      _forgotSent = false;
    });
  }

  // ── LOGIN ──

  Future<void> _doLogin() async {
    setState(() => _loading = true);
    try {
      final authService = Provider.of<AuthService>(context, listen: false);
      await authService.login(
        login: _loginNameController.text,
        password: _loginPasswordController.text,
      );
      _clearMessage();
    } on LoginFailure catch (e) {
      if (e.reason == LoginFailureReason.emailNotVerified) {
        setState(() {
          _subView = _SubView.resendVerification;
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

  // ── REGISTER ──

  Future<void> _doRegister() async {
    if (_regUsernameController.text.trim().isEmpty ||
        _regEmailController.text.trim().isEmpty ||
        _regPasswordController.text.trim().isEmpty) {
      _showError('Username, email, and password are required.');
      return;
    }

    setState(() => _loading = true);
    try {
      final authService = Provider.of<AuthService>(context, listen: false);
      await authService.register(
        firstName: _regFirstNameController.text.trim(),
        lastName: _regLastNameController.text.trim(),
        displayName: _regDisplayNameController.text.trim(),
        login: _regUsernameController.text.trim(),
        email: _regEmailController.text.trim(),
        password: _regPasswordController.text,
      );
      setState(() {
        _subView = _SubView.registerSuccess;
        _message = '';
        _isError = false;
      });
    } on LoginFailure catch (e) {
      _showError(e.message);
    } catch (e) {
      _showError('Unable to contact the server');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ── FORGOT PASSWORD ──

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

  // ── RESEND VERIFICATION ──

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
                const Icon(Icons.location_on,
                    size: 64, color: Color(0xFF0F766E)),
                const SizedBox(height: 8),
                const Text(
                  'Study Space Map',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 24),

                // ── Tab toggle (Login / Register) ──
                if (_subView == _SubView.none) ...[
                  _buildTabToggle(),
                  const SizedBox(height: 24),
                ],

                // ── View-dependent content ──
                if (_subView == _SubView.forgotPassword)
                  ..._buildForgotPasswordForm()
                else if (_subView == _SubView.resendVerification)
                  ..._buildResendVerificationForm()
                else if (_subView == _SubView.registerSuccess)
                  ..._buildRegisterSuccess()
                else if (_activeTab == _AuthTab.login)
                  ..._buildLoginForm()
                else
                  ..._buildRegisterForm(),

                // ── Message display ──
                if (_message.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color:
                          _isError ? Colors.red.shade50 : Colors.green.shade50,
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

  // ── TAB TOGGLE ──

  Widget _buildTabToggle() {
    return Row(
      children: [
        Expanded(
          child: _buildTabButton('Login', _activeTab == _AuthTab.login, () {
            _switchTab(_AuthTab.login);
          }),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildTabButton(
              'Register', _activeTab == _AuthTab.register, () {
            _switchTab(_AuthTab.register);
          }),
        ),
      ],
    );
  }

  Widget _buildTabButton(String label, bool active, VoidCallback onPressed) {
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        backgroundColor: active ? const Color(0xFF0F766E) : Colors.transparent,
        foregroundColor: active ? Colors.white : const Color(0xFF0F766E),
        side: const BorderSide(color: Color(0xFF0F766E)),
        padding: const EdgeInsets.symmetric(vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
      child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
    );
  }

  // ── LOGIN FORM ──

  List<Widget> _buildLoginForm() {
    return [
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
          onPressed: () => _switchSubView(_SubView.forgotPassword),
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
    ];
  }

  // ── REGISTER FORM ──

  List<Widget> _buildRegisterForm() {
    return [
      TextField(
        controller: _regFirstNameController,
        decoration: const InputDecoration(
          labelText: 'First Name',
          border: OutlineInputBorder(),
        ),
        textInputAction: TextInputAction.next,
      ),
      const SizedBox(height: 12),
      TextField(
        controller: _regLastNameController,
        decoration: const InputDecoration(
          labelText: 'Last Name',
          border: OutlineInputBorder(),
        ),
        textInputAction: TextInputAction.next,
      ),
      const SizedBox(height: 12),
      TextField(
        controller: _regDisplayNameController,
        decoration: const InputDecoration(
          labelText: 'Display Name',
          border: OutlineInputBorder(),
        ),
        textInputAction: TextInputAction.next,
      ),
      const SizedBox(height: 12),
      TextField(
        controller: _regEmailController,
        keyboardType: TextInputType.emailAddress,
        decoration: const InputDecoration(
          labelText: 'Email',
          border: OutlineInputBorder(),
        ),
        textInputAction: TextInputAction.next,
      ),
      const SizedBox(height: 12),
      TextField(
        controller: _regUsernameController,
        decoration: const InputDecoration(
          labelText: 'Username',
          border: OutlineInputBorder(),
        ),
        textInputAction: TextInputAction.next,
      ),
      const SizedBox(height: 12),
      TextField(
        controller: _regPasswordController,
        obscureText: true,
        decoration: const InputDecoration(
          labelText: 'Password',
          border: OutlineInputBorder(),
        ),
        onSubmitted: (_) => _doRegister(),
      ),
      const SizedBox(height: 16),
      SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          onPressed: _loading ? null : _doRegister,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF0F766E),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
          child: const Text('Register'),
        ),
      ),
    ];
  }

  // ── REGISTRATION SUCCESS ──

  List<Widget> _buildRegisterSuccess() {
    return [
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
                'Registration successful! Check your email to verify your account.',
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 16),
      SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          onPressed: () => _switchTab(_AuthTab.login),
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF0F766E),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
          child: const Text('Back to Login'),
        ),
      ),
      const SizedBox(height: 8),
      TextButton(
        onPressed: () => _switchSubView(_SubView.resendVerification),
        child: const Text('Resend Verification Email'),
      ),
    ];
  }

  // ── FORGOT PASSWORD FORM ──

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
                  'Password reset link sent! Check your inbox and click the link to reset your password.',
                ),
              ),
            ],
          ),
        ),
      ] else ...[
        const Text("Enter your email and we'll send you a reset link."),
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
            child: const Text('Send Reset Link'),
          ),
        ),
      ],
      const SizedBox(height: 12),
      TextButton(
        onPressed: () => _switchSubView(_SubView.none),
        child: const Text('\u2190 Back to Login'),
      ),
    ];
  }

  // ── RESEND VERIFICATION FORM ──

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
                'Your account has not been verified yet. Enter your email below to receive a new verification link.',
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
          child: const Text('Resend Verification Email'),
        ),
      ),
      const SizedBox(height: 12),
      TextButton(
        onPressed: () => _switchSubView(_SubView.none),
        child: const Text('\u2190 Back to Login'),
      ),
    ];
  }
}
