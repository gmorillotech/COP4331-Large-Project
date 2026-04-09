import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'auth_models.dart';
import 'auth_service.dart';

enum _AuthTab { login, register }

enum _LoginView { form, forgotPassword, resendVerification }

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  _AuthTab _activeTab = _AuthTab.login;
  _LoginView _loginView = _LoginView.form;
  String _message = '';
  bool _isError = false;
  bool _loading = false;
  bool _forgotSent = false;
  bool _showRegisterVerification = false;

  final _loginNameController = TextEditingController();
  final _loginPasswordController = TextEditingController();
  final _forgotEmailController = TextEditingController();
  final _regFirstNameController = TextEditingController();
  final _regLastNameController = TextEditingController();
  final _regDisplayNameController = TextEditingController();
  final _regEmailController = TextEditingController();
  final _regUsernameController = TextEditingController();
  final _regPasswordController = TextEditingController();
  final _verifyCodeController = TextEditingController();

  String _verificationEmail = '';
  String _verificationMaskedEmail = '';

  @override
  void dispose() {
    _loginNameController.dispose();
    _loginPasswordController.dispose();
    _forgotEmailController.dispose();
    _regFirstNameController.dispose();
    _regLastNameController.dispose();
    _regDisplayNameController.dispose();
    _regEmailController.dispose();
    _regUsernameController.dispose();
    _regPasswordController.dispose();
    _verifyCodeController.dispose();
    super.dispose();
  }

  void _showError(String msg) {
    setState(() {
      _isError = true;
      _message = msg;
    });
  }

  void _resetVerificationState() {
    _verifyCodeController.clear();
    _verificationEmail = '';
    _verificationMaskedEmail = '';
  }

  void _resetForgotPasswordState() {
    _forgotEmailController.clear();
    _forgotSent = false;
  }

  void _switchTab(_AuthTab tab) {
    setState(() {
      _activeTab = tab;
      _loginView = _LoginView.form;
      _message = '';
      _isError = false;
      _forgotSent = false;
      _showRegisterVerification = false;
    });
    _resetForgotPasswordState();
    _resetVerificationState();
  }

  void _switchLoginView(_LoginView view) {
    setState(() {
      _loginView = view;
      _message = '';
      _isError = false;
      _forgotSent = false;
    });
    if (view != _LoginView.resendVerification) {
      _resetVerificationState();
    }
  }

  Future<void> _doLogin() async {
    setState(() => _loading = true);
    try {
      final authService = Provider.of<AuthService>(context, listen: false);
      await authService.login(
        login: _loginNameController.text,
        password: _loginPasswordController.text,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _message = '';
        _isError = false;
      });
    } on LoginFailure catch (e) {
      if (!mounted) {
        return;
      }

      if (e.reason == LoginFailureReason.emailNotVerified) {
        final resolvedEmail = _normalizeEmail(e.email);
        final resolvedMaskedEmail =
            (e.maskedEmail ?? '').trim().isNotEmpty
                ? e.maskedEmail!.trim()
                : _maskEmail(resolvedEmail);

        setState(() {
          _activeTab = _AuthTab.login;
          _loginView = _LoginView.resendVerification;
          _showRegisterVerification = false;
          _verificationEmail = resolvedEmail;
          _verificationMaskedEmail = resolvedMaskedEmail;
          _verifyCodeController.clear();
          _isError = true;
          _message = resolvedMaskedEmail.isNotEmpty
              ? 'Enter the 6-digit code sent to $resolvedMaskedEmail.'
              : e.message;
        });
        return;
      }

      _showError(e.message);
    } catch (_) {
      if (mounted) {
        _showError('Unable to contact the server');
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _doRegister() async {
    if (_regUsernameController.text.trim().isEmpty ||
        _regEmailController.text.trim().isEmpty ||
        _regPasswordController.text.isEmpty) {
      _showError('Username, email, and password are required.');
      return;
    }

    setState(() => _loading = true);
    try {
      final authService = Provider.of<AuthService>(context, listen: false);
      final result = await authService.register(
        firstName: _regFirstNameController.text,
        lastName: _regLastNameController.text,
        displayName: _regDisplayNameController.text,
        login: _regUsernameController.text,
        email: _regEmailController.text,
        password: _regPasswordController.text,
      );
      if (!mounted) {
        return;
      }

      final resolvedEmail = _normalizeEmail(result.email);
      final resolvedMaskedEmail =
          (result.maskedEmail ?? '').trim().isNotEmpty
              ? result.maskedEmail!.trim()
              : _maskEmail(resolvedEmail);

      _regFirstNameController.clear();
      _regLastNameController.clear();
      _regDisplayNameController.clear();
      _regEmailController.clear();
      _regUsernameController.clear();
      _regPasswordController.clear();

      setState(() {
        _activeTab = _AuthTab.register;
        _showRegisterVerification = true;
        _verificationEmail = resolvedEmail;
        _verificationMaskedEmail = resolvedMaskedEmail;
        _verifyCodeController.clear();
        _isError = false;
        _message = resolvedMaskedEmail.isNotEmpty
            ? 'Enter the 6-digit code sent to $resolvedMaskedEmail.'
            : result.message;
      });
    } on LoginFailure catch (e) {
      if (mounted) {
        _showError(e.message);
      }
    } catch (_) {
      if (mounted) {
        _showError('Unable to contact the server');
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _doForgotPassword() async {
    if (_forgotEmailController.text.trim().isEmpty) {
      _showError('Please enter your email address.');
      return;
    }

    setState(() => _loading = true);
    try {
      final authService = Provider.of<AuthService>(context, listen: false);
      final msg = await authService.forgotPassword(
        email: _forgotEmailController.text,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _forgotSent = true;
        _isError = false;
        _message = msg;
      });
    } on LoginFailure catch (e) {
      if (mounted) {
        _showError(e.message);
      }
    } catch (_) {
      if (mounted) {
        _showError('Unable to contact the server');
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _doResendVerification() async {
    if (_verificationEmail.trim().isEmpty) {
      _showError(
        'We could not determine which email to verify. Please try logging in again.',
      );
      return;
    }

    setState(() => _loading = true);
    try {
      final authService = Provider.of<AuthService>(context, listen: false);
      final delivery = await authService.resendVerification(
        email: _verificationEmail,
      );
      if (!mounted) {
        return;
      }

      final resolvedEmail =
          _normalizeEmail(delivery.email).isNotEmpty
              ? _normalizeEmail(delivery.email)
              : _verificationEmail;
      final resolvedMaskedEmail =
          (delivery.maskedEmail ?? '').trim().isNotEmpty
              ? delivery.maskedEmail!.trim()
              : _maskEmail(resolvedEmail);

      setState(() {
        _verificationEmail = resolvedEmail;
        _verificationMaskedEmail = resolvedMaskedEmail;
        _isError = false;
        _message = resolvedMaskedEmail.isNotEmpty
            ? 'A new 6-digit code was sent to $resolvedMaskedEmail.'
            : (delivery.message.isNotEmpty
                ? delivery.message
                : 'Verification code sent! Check your inbox.');
      });
    } on LoginFailure catch (e) {
      if (mounted) {
        _showError(e.message);
      }
    } catch (_) {
      if (mounted) {
        _showError('Unable to contact the server');
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _doVerifyCode() async {
    if (_verifyCodeController.text.trim().isEmpty) {
      _showError('Please enter the verification code.');
      return;
    }
    if (_verificationEmail.trim().isEmpty) {
      _showError(
        'We could not determine which email to verify. Please request a new code.',
      );
      return;
    }

    setState(() => _loading = true);
    try {
      final authService = Provider.of<AuthService>(context, listen: false);
      final message = await authService.verifyEmail(
        email: _verificationEmail,
        code: _verifyCodeController.text,
      );
      if (!mounted) {
        return;
      }

      setState(() {
        _activeTab = _AuthTab.login;
        _loginView = _LoginView.form;
        _showRegisterVerification = false;
        _verifyCodeController.clear();
        _verificationEmail = '';
        _verificationMaskedEmail = '';
        _isError = false;
        _message = message.isNotEmpty
            ? message
            : 'Email verified! You can now log in.';
      });
    } on LoginFailure catch (e) {
      if (mounted) {
        _showError(e.message);
      }
    } catch (_) {
      if (mounted) {
        _showError('Unable to contact the server');
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.location_on,
                  size: 64,
                  color: Color(0xFF0F766E),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Study Space Map',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 24),
                _buildTabs(),
                const SizedBox(height: 20),
                if (_activeTab == _AuthTab.login) ..._buildLoginPanel(),
                if (_activeTab == _AuthTab.register) ..._buildRegisterPanel(),
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

  Widget _buildTabs() {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(14),
      ),
      padding: const EdgeInsets.all(4),
      child: Row(
        children: [
          Expanded(
            child: _tabButton(
              key: const Key('login-tab-button'),
              label: 'Login',
              selected: _activeTab == _AuthTab.login,
              onPressed: () => _switchTab(_AuthTab.login),
            ),
          ),
          Expanded(
            child: _tabButton(
              key: const Key('register-tab-button'),
              label: 'Register',
              selected: _activeTab == _AuthTab.register,
              onPressed: () => _switchTab(_AuthTab.register),
            ),
          ),
        ],
      ),
    );
  }

  Widget _tabButton({
    required Key key,
    required String label,
    required bool selected,
    required VoidCallback onPressed,
  }) {
    return FilledButton(
      key: key,
      onPressed: _loading ? null : onPressed,
      style: FilledButton.styleFrom(
        backgroundColor:
            selected ? const Color(0xFF0F766E) : Colors.transparent,
        foregroundColor: selected ? Colors.white : const Color(0xFF334155),
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      child: Text(label),
    );
  }

  List<Widget> _buildLoginPanel() {
    switch (_loginView) {
      case _LoginView.form:
        return _buildLoginForm();
      case _LoginView.forgotPassword:
        return _buildForgotPasswordForm();
      case _LoginView.resendVerification:
        return _buildLoginVerificationForm();
    }
  }

  List<Widget> _buildLoginForm() {
    return [
      const Text(
        'LOG IN',
        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
      ),
      const SizedBox(height: 16),
      TextField(
        key: const Key('login-username-field'),
        controller: _loginNameController,
        decoration: const InputDecoration(
          labelText: 'Username',
          border: OutlineInputBorder(),
        ),
        textInputAction: TextInputAction.next,
      ),
      const SizedBox(height: 12),
      TextField(
        key: const Key('login-password-field'),
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
          key: const Key('forgot-password-button'),
          onPressed: _loading
              ? null
              : () => _switchLoginView(_LoginView.forgotPassword),
          child: const Text('Forgot Password?'),
        ),
      ),
      const SizedBox(height: 8),
      SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          key: const Key('login-submit-button'),
          onPressed: _loading ? null : _doLogin,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF0F766E),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
          child: const Text('Login'),
        ),
      ),
      const SizedBox(height: 12),
      TextButton(
        key: const Key('switch-to-register-button'),
        onPressed: _loading ? null : () => _switchTab(_AuthTab.register),
        child: const Text('Need an account? Register here'),
      ),
    ];
  }

  List<Widget> _buildForgotPasswordForm() {
    return [
      const Text(
        'FORGOT PASSWORD',
        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
      ),
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
          key: const Key('forgot-email-field'),
          controller: _forgotEmailController,
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
            key: const Key('forgot-submit-button'),
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
        key: const Key('forgot-back-button'),
        onPressed: _loading ? null : () => _switchLoginView(_LoginView.form),
        child: const Text('\u2190 Back to Login'),
      ),
    ];
  }

  List<Widget> _buildLoginVerificationForm() {
    return _buildVerificationCard(
      title: 'VERIFY YOUR EMAIL',
      resendKey: const Key('login-resend-code-button'),
      verifyKey: const Key('login-verify-button'),
      backButton: TextButton(
        key: const Key('verification-back-button'),
        onPressed: _loading ? null : () => _switchLoginView(_LoginView.form),
        child: const Text('\u2190 Back to Login'),
      ),
    );
  }

  List<Widget> _buildRegisterPanel() {
    if (_showRegisterVerification) {
      return _buildVerificationCard(
        title: 'CHECK YOUR EMAIL',
        resendKey: const Key('register-resend-code-button'),
        verifyKey: const Key('register-verify-button'),
        backButton: TextButton(
          key: const Key('register-verification-back-button'),
          onPressed: _loading
              ? null
              : () {
                  setState(() {
                    _showRegisterVerification = false;
                    _message = '';
                    _isError = false;
                  });
                  _resetVerificationState();
                },
          child: const Text('\u2190 Back to Register'),
        ),
      );
    }

    return [
      const Text(
        'REGISTER',
        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
      ),
      const SizedBox(height: 16),
      TextField(
        key: const Key('register-first-name-field'),
        controller: _regFirstNameController,
        decoration: const InputDecoration(
          labelText: 'First Name',
          border: OutlineInputBorder(),
        ),
        textInputAction: TextInputAction.next,
      ),
      const SizedBox(height: 12),
      TextField(
        key: const Key('register-last-name-field'),
        controller: _regLastNameController,
        decoration: const InputDecoration(
          labelText: 'Last Name',
          border: OutlineInputBorder(),
        ),
        textInputAction: TextInputAction.next,
      ),
      const SizedBox(height: 12),
      TextField(
        key: const Key('register-display-name-field'),
        controller: _regDisplayNameController,
        decoration: const InputDecoration(
          labelText: 'Display Name',
          border: OutlineInputBorder(),
        ),
        textInputAction: TextInputAction.next,
      ),
      const SizedBox(height: 12),
      TextField(
        key: const Key('register-email-field'),
        controller: _regEmailController,
        keyboardType: TextInputType.emailAddress,
        decoration: const InputDecoration(
          labelText: 'Email *',
          border: OutlineInputBorder(),
        ),
        textInputAction: TextInputAction.next,
      ),
      const SizedBox(height: 12),
      TextField(
        key: const Key('register-username-field'),
        controller: _regUsernameController,
        decoration: const InputDecoration(
          labelText: 'Username *',
          border: OutlineInputBorder(),
        ),
        textInputAction: TextInputAction.next,
      ),
      const SizedBox(height: 12),
      TextField(
        key: const Key('register-password-field'),
        controller: _regPasswordController,
        obscureText: true,
        decoration: const InputDecoration(
          labelText: 'Password *',
          border: OutlineInputBorder(),
        ),
        onSubmitted: (_) => _doRegister(),
      ),
      const SizedBox(height: 12),
      SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          key: const Key('register-submit-button'),
          onPressed: _loading ? null : _doRegister,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF0F766E),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
          child: const Text('Create Account'),
        ),
      ),
    ];
  }

  List<Widget> _buildVerificationCard({
    required String title,
    required Key resendKey,
    required Key verifyKey,
    Widget? backButton,
  }) {
    final emailLabel = _verificationMaskedEmail.isNotEmpty
        ? _verificationMaskedEmail
        : 'your email';

    return [
      Text(
        title,
        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
      ),
      const SizedBox(height: 16),
      Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.blue.shade50,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            const Icon(Icons.email, color: Colors.blue),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'Enter the 6-digit code sent to $emailLabel.',
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 12),
      TextField(
        key: const Key('verification-code-field'),
        controller: _verifyCodeController,
        keyboardType: TextInputType.number,
        maxLength: 6,
        decoration: const InputDecoration(
          labelText: 'Verification Code',
          border: OutlineInputBorder(),
        ),
        onSubmitted: (_) => _doVerifyCode(),
      ),
      const SizedBox(height: 8),
      SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          key: verifyKey,
          onPressed: _loading ? null : _doVerifyCode,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF0F766E),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
          child: const Text('Verify Account'),
        ),
      ),
      const SizedBox(height: 8),
      TextButton(
        key: resendKey,
        onPressed: _loading ? null : _doResendVerification,
        child: const Text('Resend code'),
      ),
      if (backButton != null) backButton,
    ];
  }
}

String _normalizeEmail(String? email) {
  return (email ?? '').trim().toLowerCase();
}

String _maskEmail(String email) {
  final normalizedEmail = _normalizeEmail(email);
  final atIndex = normalizedEmail.indexOf('@');
  if (atIndex <= 0) {
    return normalizedEmail;
  }

  final localPart = normalizedEmail.substring(0, atIndex);
  final domain = normalizedEmail.substring(atIndex + 1);
  final visiblePart =
      localPart.length <= 2 ? localPart : localPart.substring(0, 2);
  final maskedPart = List.filled(
    localPart.length - visiblePart.length,
    '*',
  ).join();
  return '$visiblePart$maskedPart@$domain';
}
