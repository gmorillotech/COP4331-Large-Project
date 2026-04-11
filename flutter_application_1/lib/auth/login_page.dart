import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'auth_models.dart';
import 'auth_service.dart';

enum _AuthTab { login, register }

enum _LoginView {
  form,
  forgotPassword,
  forgotPasswordCode,
  forgotPasswordNewPassword,
  resendVerification,
}

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
  bool _showRegisterVerification = false;

  final _loginNameController = TextEditingController();
  final _loginPasswordController = TextEditingController();
  final _forgotLoginController = TextEditingController();
  final _regFirstNameController = TextEditingController();
  final _regLastNameController = TextEditingController();
  final _regDisplayNameController = TextEditingController();
  final _regEmailController = TextEditingController();
  final _regUsernameController = TextEditingController();
  final _regPasswordController = TextEditingController();
  final _verifyCodeController = TextEditingController();
  final _resetCodeController = TextEditingController();
  final _resetNewPasswordController = TextEditingController();
  final _resetConfirmPasswordController = TextEditingController();

  String _verificationEmail = '';
  String _verificationMaskedEmail = '';
  String _resetEmail = '';
  String _resetMaskedEmail = '';
  bool _isForcedResetFlow = false;

  String _regUsernameValue = '';
  String _regPasswordValue = '';

  @override
  void dispose() {
    _loginNameController.dispose();
    _loginPasswordController.dispose();
    _forgotLoginController.dispose();
    _regFirstNameController.dispose();
    _regLastNameController.dispose();
    _regDisplayNameController.dispose();
    _regEmailController.dispose();
    _regUsernameController.dispose();
    _regPasswordController.dispose();
    _verifyCodeController.dispose();
    _resetCodeController.dispose();
    _resetNewPasswordController.dispose();
    _resetConfirmPasswordController.dispose();
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
    _isForcedResetFlow = false;
  }

  void _resetForgotPasswordState() {
    _forgotLoginController.clear();
    _resetCodeController.clear();
    _resetNewPasswordController.clear();
    _resetConfirmPasswordController.clear();
    _resetEmail = '';
    _resetMaskedEmail = '';
  }

  void _switchTab(_AuthTab tab) {
    setState(() {
      _activeTab = tab;
      _loginView = _LoginView.form;
      _message = '';
      _isError = false;
      _showRegisterVerification = false;
      _regUsernameValue = '';
      _regPasswordValue = '';
    });
    _resetForgotPasswordState();
    _resetVerificationState();
  }

  void _switchLoginView(_LoginView view) {
    setState(() {
      _loginView = view;
      _message = '';
      _isError = false;
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
          _isForcedResetFlow = false;
          _verifyCodeController.clear();
          _isError = true;
          _message = resolvedMaskedEmail.isNotEmpty
              ? 'Enter the 6-digit code sent to $resolvedMaskedEmail.'
              : e.message;
        });
        return;
      }

      if (e.reason == LoginFailureReason.forcedResetVerify) {
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
          _isForcedResetFlow = true;
          _verifyCodeController.clear();
          _isError = true;
          _message = resolvedMaskedEmail.isNotEmpty
              ? 'Enter the 6-digit verification code sent to $resolvedMaskedEmail to continue resetting your password.'
              : e.message;
        });
        return;
      }

      if (e.reason == LoginFailureReason.forcedReset) {
        final resolvedEmail = _normalizeEmail(e.email);
        final resolvedMaskedEmail =
            (e.maskedEmail ?? '').trim().isNotEmpty
                ? e.maskedEmail!.trim()
                : _maskEmail(resolvedEmail);

        setState(() {
          _activeTab = _AuthTab.login;
          _loginView = _LoginView.forgotPasswordCode;
          _showRegisterVerification = false;
          _resetEmail = resolvedEmail;
          _resetMaskedEmail = resolvedMaskedEmail;
          _resetCodeController.clear();
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
    final username = _regUsernameController.text.trim();
    final email = _regEmailController.text.trim();
    final password = _regPasswordController.text;

    if (username.isEmpty || email.isEmpty || password.isEmpty) {
      _showError('Username, email, and password are required.');
      return;
    }

    final usernameErrors = validateUsername(username);
    if (usernameErrors.isNotEmpty) {
      _showError('Username: ${usernameErrors.join(', ')}.');
      return;
    }

    final passwordErrors = validatePassword(password);
    if (passwordErrors.isNotEmpty) {
      _showError('Password must have ${passwordErrors.join(', ')}.');
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
        _regUsernameValue = '';
        _regPasswordValue = '';
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
    if (_forgotLoginController.text.trim().isEmpty) {
      _showError('Please enter your username.');
      return;
    }

    setState(() => _loading = true);
    try {
      final authService = Provider.of<AuthService>(context, listen: false);
      final result = await authService.forgotPassword(
        login: _forgotLoginController.text,
      );
      if (!mounted) {
        return;
      }

      final resolvedEmail = _normalizeEmail(result.email);
      final resolvedMaskedEmail =
          (result.maskedEmail ?? '').trim().isNotEmpty
              ? result.maskedEmail!.trim()
              : (resolvedEmail.isNotEmpty ? _maskEmail(resolvedEmail) : '');

      setState(() {
        _resetEmail = resolvedEmail;
        _resetMaskedEmail = resolvedMaskedEmail;
        _loginView = _LoginView.forgotPasswordCode;
        _resetCodeController.clear();
        _isError = false;
        _message = resolvedMaskedEmail.isNotEmpty
            ? 'Enter the 6-digit code sent to $resolvedMaskedEmail.'
            : (result.message.isNotEmpty
                ? result.message
                : 'If an account exists, a reset code has been sent.');
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

  void _doResetCode() {
    final code = _resetCodeController.text.trim();
    if (code.isEmpty) {
      _showError('Please enter the 6-digit reset code.');
      return;
    }

    setState(() {
      _loginView = _LoginView.forgotPasswordNewPassword;
      _message = '';
      _isError = false;
    });
  }

  Future<void> _doResetPassword() async {
    final newPassword = _resetNewPasswordController.text;
    final confirmPassword = _resetConfirmPasswordController.text;

    final passwordErrors = validatePassword(newPassword);
    if (passwordErrors.isNotEmpty) {
      _showError('Password must have ${passwordErrors.join(', ')}.');
      return;
    }

    if (newPassword != confirmPassword) {
      _showError('Passwords do not match.');
      return;
    }

    setState(() => _loading = true);
    try {
      final authService = Provider.of<AuthService>(context, listen: false);
      final message = await authService.resetPassword(
        email: _resetEmail,
        code: _resetCodeController.text,
        newPassword: newPassword,
      );
      if (!mounted) {
        return;
      }

      _resetForgotPasswordState();
      setState(() {
        _loginView = _LoginView.form;
        _isError = false;
        _message =
            message.isNotEmpty ? message : 'Password reset! You can now log in.';
      });
    } on LoginFailure catch (e) {
      if (mounted) {
        setState(() {
          _loginView = _LoginView.forgotPasswordCode;
        });
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
      final result = await authService.verifyEmail(
        email: _verificationEmail,
        code: _verifyCodeController.text,
      );
      if (!mounted) {
        return;
      }

      if (result.requiresPasswordReset || _isForcedResetFlow) {
        final resultEmail = _normalizeEmail(result.email);
        final resolvedEmail =
            resultEmail.isNotEmpty ? resultEmail : _verificationEmail;
        final resolvedMaskedEmail =
            (result.maskedEmail ?? '').trim().isNotEmpty
                ? result.maskedEmail!.trim()
                : _verificationMaskedEmail;

        setState(() {
          _resetEmail = resolvedEmail;
          _resetMaskedEmail = resolvedMaskedEmail;
          _resetCodeController.text = _verifyCodeController.text.trim();
          _loginView = _LoginView.forgotPasswordNewPassword;
          _showRegisterVerification = false;
          _verificationEmail = '';
          _verificationMaskedEmail = '';
          _isForcedResetFlow = false;
          _isError = false;
          _message = 'Email verified. Set a new password to continue.';
        });
        _verifyCodeController.clear();
        return;
      }

      setState(() {
        _activeTab = _AuthTab.login;
        _loginView = _LoginView.form;
        _showRegisterVerification = false;
        _verifyCodeController.clear();
        _verificationEmail = '';
        _verificationMaskedEmail = '';
        _isForcedResetFlow = false;
        _isError = false;
        _message = result.message.isNotEmpty
            ? result.message
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
      case _LoginView.forgotPasswordCode:
        return _buildForgotPasswordCodeForm();
      case _LoginView.forgotPasswordNewPassword:
        return _buildForgotPasswordNewPasswordForm();
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
      const Text("Enter your username and we'll send you a reset code."),
      const SizedBox(height: 12),
      TextField(
        key: const Key('forgot-login-field'),
        controller: _forgotLoginController,
        decoration: const InputDecoration(
          labelText: 'Username',
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
      const SizedBox(height: 12),
      TextButton(
        key: const Key('forgot-back-button'),
        onPressed: _loading ? null : () => _switchLoginView(_LoginView.form),
        child: const Text('\u2190 Back to Login'),
      ),
    ];
  }

  List<Widget> _buildForgotPasswordCodeForm() {
    final emailLabel =
        _resetMaskedEmail.isNotEmpty ? _resetMaskedEmail : 'your email';

    return [
      const Text(
        'RESET PASSWORD',
        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
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
              child: Text('Enter the 6-digit code sent to $emailLabel.'),
            ),
          ],
        ),
      ),
      const SizedBox(height: 12),
      TextField(
        key: const Key('reset-code-field'),
        controller: _resetCodeController,
        keyboardType: TextInputType.number,
        maxLength: 6,
        decoration: const InputDecoration(
          labelText: 'Reset Code',
          border: OutlineInputBorder(),
        ),
        onSubmitted: (_) => _doResetCode(),
      ),
      const SizedBox(height: 8),
      SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          key: const Key('reset-code-submit-button'),
          onPressed: _loading ? null : _doResetCode,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF0F766E),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
          child: const Text('Verify Code'),
        ),
      ),
      const SizedBox(height: 12),
      TextButton(
        key: const Key('reset-code-back-button'),
        onPressed: _loading
            ? null
            : () {
                _resetForgotPasswordState();
                _switchLoginView(_LoginView.form);
              },
        child: const Text('\u2190 Back to Login'),
      ),
    ];
  }

  List<Widget> _buildForgotPasswordNewPasswordForm() {
    final newPassword = _resetNewPasswordController.text;

    return [
      const Text(
        'SET NEW PASSWORD',
        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
      ),
      const SizedBox(height: 16),
      TextField(
        key: const Key('reset-new-password-field'),
        controller: _resetNewPasswordController,
        obscureText: true,
        decoration: const InputDecoration(
          labelText: 'New Password',
          border: OutlineInputBorder(),
        ),
        onChanged: (_) => setState(() {}),
        textInputAction: TextInputAction.next,
      ),
      if (newPassword.isNotEmpty) ...[
        const SizedBox(height: 8),
        Wrap(
          spacing: 16,
          runSpacing: 4,
          children: [
            _validationRule(
              'At least 8 characters',
              newPassword.length >= 8,
            ),
            _validationRule(
              'At least one letter',
              RegExp(r'[a-zA-Z]').hasMatch(newPassword),
            ),
            _validationRule(
              'At least one number',
              RegExp(r'[0-9]').hasMatch(newPassword),
            ),
            _validationRule(
              'At least one special character',
              RegExp(r'[^a-zA-Z0-9]').hasMatch(newPassword),
            ),
          ],
        ),
      ],
      const SizedBox(height: 12),
      TextField(
        key: const Key('reset-confirm-password-field'),
        controller: _resetConfirmPasswordController,
        obscureText: true,
        decoration: const InputDecoration(
          labelText: 'Confirm New Password',
          border: OutlineInputBorder(),
        ),
        onSubmitted: (_) => _doResetPassword(),
      ),
      const SizedBox(height: 12),
      SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          key: const Key('reset-password-submit-button'),
          onPressed: _loading ? null : _doResetPassword,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF0F766E),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
          child: const Text('Reset Password'),
        ),
      ),
      const SizedBox(height: 12),
      TextButton(
        key: const Key('reset-password-back-button'),
        onPressed: _loading
            ? null
            : () {
                _resetForgotPasswordState();
                _switchLoginView(_LoginView.form);
              },
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
        onChanged: (value) => setState(() => _regUsernameValue = value),
      ),
      if (_regUsernameValue.isNotEmpty) ...[
        const SizedBox(height: 8),
        Wrap(
          spacing: 16,
          runSpacing: 4,
          children: [
            _validationRule(
              '3\u201322 characters',
              _regUsernameValue.length >= 3 && _regUsernameValue.length <= 22,
            ),
            _validationRule(
              'At least one letter',
              RegExp(r'[a-zA-Z]').hasMatch(_regUsernameValue),
            ),
          ],
        ),
      ],
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
        onChanged: (value) => setState(() => _regPasswordValue = value),
      ),
      if (_regPasswordValue.isNotEmpty) ...[
        const SizedBox(height: 8),
        Wrap(
          spacing: 16,
          runSpacing: 4,
          children: [
            _validationRule(
              'At least 8 characters',
              _regPasswordValue.length >= 8,
            ),
            _validationRule(
              'At least one letter',
              RegExp(r'[a-zA-Z]').hasMatch(_regPasswordValue),
            ),
            _validationRule(
              'At least one number',
              RegExp(r'[0-9]').hasMatch(_regPasswordValue),
            ),
            _validationRule(
              'At least one special character',
              RegExp(r'[^a-zA-Z0-9]').hasMatch(_regPasswordValue),
            ),
          ],
        ),
      ],
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

  Widget _validationRule(String label, bool satisfied) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          satisfied ? Icons.check_circle : Icons.circle_outlined,
          size: 14,
          color: satisfied ? const Color(0xFF15803D) : const Color(0xFF9CA3AF),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            color:
                satisfied ? const Color(0xFF15803D) : const Color(0xFF6B7280),
          ),
        ),
      ],
    );
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
