import type { MouseEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../config';
import { maskEmail } from '../utils/emailMask';
import './Login.css';

type Tab = 'login' | 'register';
type LoginView = 'form' | 'forgot-password' | 'resend-verification';
type VerificationFlow = 'standard' | 'forced-reset';

type AuthUser = {
  userId: string;
  login: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  favorites: string[];
  userNoiseWF: number;
  userOccupancyWF: number;
  role?: string;
  accountStatus?: string;
};

type LoginResponse = {
  accessToken?: string;
  user?: AuthUser;
  error?: string;
  reason?: string;
  email?: string;
  maskedEmail?: string;
};

type RegisterResponse = {
  userId: string;
  login: string;
  email: string;
  maskedEmail?: string;
  message: string;
  error?: string;
};

type GenericResponse = {
  message?: string;
  error?: string;
  reason?: string;
  email?: string;
  maskedEmail?: string;
  requiresPasswordReset?: boolean;
};

// ── Validation helpers ──────────────────────────────────
function validatePassword(pw: string): string[] {
  const errors: string[] = [];
  if (pw.length < 8) errors.push('at least 8 characters');
  if (!/[a-zA-Z]/.test(pw)) errors.push('at least one letter');
  if (!/[0-9]/.test(pw)) errors.push('at least one number');
  if (!/[^a-zA-Z0-9]/.test(pw)) errors.push('at least one special character');
  return errors;
}

function validateUsername(u: string): string[] {
  const errors: string[] = [];
  if (u.length < 3 || u.length > 22) errors.push('3–22 characters');
  if (!/[a-zA-Z]/.test(u)) errors.push('at least one letter');
  return errors;
}

// ── Eye toggle component ────────────────────────────────
function EyeToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="eye-toggle"
      onClick={onToggle}
      aria-label={show ? 'Hide password' : 'Show password'}
      tabIndex={-1}
    >
      {show ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      )}
    </button>
  );
}

function Login() {
  const [activeTab, setActiveTab] = useState<Tab>('login');
  const [loginView, setLoginView] = useState<LoginView>('form');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const [loginName, setLoginName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const [showVerifyBox, setShowVerifyBox] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationMaskedEmail, setVerificationMaskedEmail] = useState('');
  const [_verificationFlow, setVerificationFlow] = useState<VerificationFlow>('standard');

  const [forgotStep, setForgotStep] = useState<'lookup' | 'code' | 'newpass'>('lookup');
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetMaskedEmail, setResetMaskedEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Validation & UI state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [activeField, setActiveField] = useState<string | null>(null);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const navigate = useNavigate();

  function showSuccess(msg: string): void { setIsError(false); setMessage(msg); }
  function showError(msg: string): void { setIsError(true); setMessage(msg); }

  function resetForgotPasswordState(): void {
    setForgotStep('lookup');
    setResetIdentifier('');
    setResetEmail('');
    setResetMaskedEmail('');
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
    setFieldErrors({});
  }

  function resetVerificationState(): void {
    setVerifyCode('');
    setVerificationEmail('');
    setVerificationMaskedEmail('');
    setVerificationFlow('standard');
  }

  function handleTabSwitch(tab: Tab): void {
    setActiveTab(tab);
    setLoginView('form');
    setMessage('');
    setIsError(false);
    setShowVerifyBox(false);
    setFieldErrors({});
    setActiveField(null);
    resetVerificationState();
    resetForgotPasswordState();
  }

  async function doLogin(event?: MouseEvent<HTMLInputElement>): Promise<void> {
    event?.preventDefault();
    try {
      const response = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        body: JSON.stringify({ login: loginName, password: loginPassword }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res: LoginResponse = await response.json();

      if (!response.ok) {
        const errorMsg = res.error || '';
        const resolvedEmail = res.email?.trim().toLowerCase() || '';
        const resolvedMaskedEmail = res.maskedEmail || (resolvedEmail ? maskEmail(resolvedEmail) : '');

        if (res.reason === 'forced_reset_verify') {
          setLoginView('resend-verification');
          setVerificationFlow('forced-reset');
          setVerificationEmail(resolvedEmail);
          setVerificationMaskedEmail(resolvedMaskedEmail);
          setVerifyCode('');
          showError(resolvedMaskedEmail
            ? `Enter the 6-digit verification code sent to ${resolvedMaskedEmail} to continue resetting your password.`
            : errorMsg || 'Verify your email to continue resetting your password.');
          return;
        }

        if (res.reason === 'forced_reset') {
          setLoginView('forgot-password');
          setResetIdentifier(loginName.trim());
          setResetEmail(resolvedEmail);
          setResetMaskedEmail(resolvedMaskedEmail);
          setResetCode('');
          setNewPassword('');
          setConfirmPassword('');
          setForgotStep('code');
          showError(resolvedMaskedEmail
            ? `Enter the 6-digit code sent to ${resolvedMaskedEmail}.`
            : errorMsg || 'A password reset is required for this account.');
          return;
        }

        if (res.reason === 'email_not_verified' || errorMsg.toLowerCase().includes('verify')) {
          setLoginView('resend-verification');
          setVerificationFlow('standard');
          setVerificationEmail(resolvedEmail);
          setVerificationMaskedEmail(resolvedMaskedEmail);
          setVerifyCode('');
          showError(resolvedMaskedEmail
            ? `Enter the 6-digit code sent to ${resolvedMaskedEmail}.`
            : 'Your account is not verified. Enter the 6-digit code sent to your email.');
          return;
        }

        showError(errorMsg || 'User/Password combination incorrect');
        return;
      }

      if (!res.user || !res.accessToken) {
        showError('Login failed. Please try again.');
        return;
      }

      localStorage.setItem('user_data', JSON.stringify(res.user));
      localStorage.setItem('token', res.accessToken);
      setMessage('');
      navigate(res.user.role === 'admin' ? '/admin' : '/home');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to contact the server');
    }
  }

  async function doRegister(event?: MouseEvent<HTMLInputElement>): Promise<void> {
    event?.preventDefault();

    const errors: Record<string, string> = {};

    if (!regFirstName.trim()) errors.regFirstName = 'First name is required.';
    if (!regLastName.trim()) errors.regLastName = 'Last name is required.';
    if (!regDisplayName.trim()) errors.regDisplayName = 'Display name is required.';
    if (!regEmail.trim()) errors.regEmail = 'Email is required.';
    if (!regUsername.trim()) {
      errors.regUsername = 'Username is required.';
    } else {
      const uErrs = validateUsername(regUsername.trim());
      if (uErrs.length > 0) errors.regUsername = uErrs.join(' · ');
    }
    if (!regPassword) {
      errors.regPassword = 'required';
    } else {
      const pErrs = validatePassword(regPassword);
      if (pErrs.length > 0) errors.regPassword = 'invalid';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      showError('Please fill in all required fields.');
      return;
    }

    setFieldErrors({});
    const normalizedRegEmail = regEmail.trim().toLowerCase();

    try {
      const response = await fetch(apiUrl('/api/auth/register'), {
        method: 'POST',
        body: JSON.stringify({
          firstName: regFirstName,
          lastName: regLastName,
          displayName: regDisplayName,
          login: regUsername,
          email: regEmail,
          password: regPassword,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res: RegisterResponse = await response.json();

      if (!response.ok) {
        showError(res.error || 'Registration failed. Please try again.');
        return;
      }

      setRegFirstName('');
      setRegLastName('');
      setRegDisplayName('');
      setRegEmail('');
      setRegUsername('');
      setRegPassword('');
      setMessage('');
      setVerificationEmail(normalizedRegEmail);
      setVerificationMaskedEmail(res.maskedEmail || maskEmail(normalizedRegEmail));
      setVerifyCode('');
      setShowVerifyBox(true);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to contact the server');
    }
  }

  async function doRequestResetCode(event?: MouseEvent<HTMLInputElement>): Promise<void> {
    event?.preventDefault();
    if (!resetIdentifier.trim()) {
      showError('Please enter your username.');
      return;
    }
    try {
      const response = await fetch(apiUrl('/api/auth/forgot-password'), {
        method: 'POST',
        body: JSON.stringify({ login: resetIdentifier.trim() }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res: GenericResponse = await response.json();
      if (!response.ok) { showError(res.error || 'Failed to send reset code.'); return; }
      if (!res.email) { showSuccess(res.message || 'If an account exists, a reset code has been sent.'); return; }
      const resolvedEmail = res.email.trim().toLowerCase();
      const resolvedMaskedEmail = res.maskedEmail || maskEmail(resolvedEmail);
      setResetEmail(resolvedEmail);
      setResetMaskedEmail(resolvedMaskedEmail);
      setResetCode('');
      setForgotStep('code');
      showSuccess(`Enter the 6-digit code sent to ${resolvedMaskedEmail}.`);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to contact the server');
    }
  }

  async function doVerifyResetCode(event?: MouseEvent<HTMLInputElement>): Promise<void> {
    event?.preventDefault();
    if (!resetCode.trim()) { showError('Please enter the reset code.'); return; }
    setForgotStep('newpass');
    setMessage('');
    setFieldErrors({});
  }

  async function doResetPassword(event?: MouseEvent<HTMLInputElement>): Promise<void> {
    event?.preventDefault();

    if (!resetEmail) { showError('We could not determine which account to reset. Please start again.'); return; }

    const errors: Record<string, string> = {};
    if (!newPassword) {
      errors.newPassword = 'required';
    } else {
      const pErrs = validatePassword(newPassword);
      if (pErrs.length > 0) errors.newPassword = 'invalid';
    }
    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your password.';
    } else if (newPassword !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    try {
      const response = await fetch(apiUrl('/api/auth/reset-password'), {
        method: 'POST',
        body: JSON.stringify({ email: resetEmail, code: resetCode, newPassword }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res: GenericResponse = await response.json();
      if (!response.ok) {
        showError(res.error || 'Reset failed. Your code may have expired.');
        setForgotStep('code');
        return;
      }
      showSuccess('Password reset! You can now log in.');
      setTimeout(() => { setLoginView('form'); resetForgotPasswordState(); }, 2500);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to contact the server');
    }
  }

  async function doResendVerification(event?: MouseEvent<HTMLInputElement>): Promise<void> {
    event?.preventDefault();
    const targetEmail = verificationEmail.trim().toLowerCase();
    if (!targetEmail) { showError('We could not determine which email to verify. Please try logging in again.'); return; }
    try {
      const response = await fetch(apiUrl('/api/auth/resend-verification'), {
        method: 'POST',
        body: JSON.stringify({ email: targetEmail }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res: GenericResponse = await response.json();
      if (!response.ok) { showError(res.error || 'Unable to resend verification code.'); return; }
      const resolvedEmail = res.email?.trim().toLowerCase() || targetEmail;
      const resolvedMaskedEmail = res.maskedEmail || maskEmail(resolvedEmail);
      setVerificationEmail(resolvedEmail);
      setVerificationMaskedEmail(resolvedMaskedEmail);
      showSuccess(`A new 6-digit code was sent to ${resolvedMaskedEmail}.`);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to contact the server');
    }
  }

  async function doVerifyCode(event?: MouseEvent<HTMLInputElement>): Promise<void> {
    event?.preventDefault();
    if (!verifyCode.trim()) { showError('Please enter the verification code.'); return; }
    if (!verificationEmail) { showError('We could not determine which email to verify. Please request a new code.'); return; }
    try {
      const response = await fetch(apiUrl('/api/auth/verify-email'), {
        method: 'POST',
        body: JSON.stringify({ email: verificationEmail, code: verifyCode.trim() }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res: GenericResponse = await response.json();
      if (!response.ok) { showError(res.error || 'Invalid or expired code.'); return; }
      const resolvedEmail = res.email?.trim().toLowerCase() || verificationEmail;
      const resolvedMaskedEmail = res.maskedEmail || (resolvedEmail ? maskEmail(resolvedEmail) : verificationMaskedEmail);
      if (res.requiresPasswordReset) {
        setVerificationEmail(resolvedEmail);
        setVerificationMaskedEmail(resolvedMaskedEmail);
        setResetIdentifier(loginName.trim());
        setResetEmail(resolvedEmail);
        setResetMaskedEmail(resolvedMaskedEmail);
        setResetCode(verifyCode.trim());
        setNewPassword('');
        setConfirmPassword('');
        setForgotStep('newpass');
        setLoginView('forgot-password');
        showSuccess('Email verified. Set a new password to finish signing in.');
        return;
      }
      showSuccess('Email verified! You can now log in.');
      resetVerificationState();
      setShowVerifyBox(false);
      handleTabSwitch('login');
      setTimeout(() => handleTabSwitch('login'), 2500);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to contact the server');
    }
  }

  // ── helpers for live rule highlighting ─────────────────
  const pwRules = [
    { label: 'At least 8 characters',         ok: (p: string) => p.length >= 8 },
    { label: 'At least one letter',            ok: (p: string) => /[a-zA-Z]/.test(p) },
    { label: 'At least one number',            ok: (p: string) => /[0-9]/.test(p) },
    { label: 'At least one special character', ok: (p: string) => /[^a-zA-Z0-9]/.test(p) },
  ];

  const uRules = [
    { label: '3–22 characters',    ok: (u: string) => u.length >= 3 && u.length <= 22 },
    { label: 'At least one letter', ok: (u: string) => /[a-zA-Z]/.test(u) },
  ];

  // True when we're on the main login form (for inline message positioning)
  const isLoginForm = activeTab === 'login' && loginView === 'form' && !showVerifyBox;

  return (
    <div id="loginDiv">
      {/* ── Tabs ── */}
      <div id="authTabs">
        <button
          type="button"
          className={`tab-btn${activeTab === 'login' ? ' active' : ''}`}
          onClick={() => handleTabSwitch('login')}
        >
          Login
        </button>
        <button
          type="button"
          className={`tab-btn${activeTab === 'register' ? ' active' : ''}`}
          onClick={() => handleTabSwitch('register')}
        >
          Register
        </button>
      </div>

      {/* ── Global message (all views except main login form, where it's shown inline) ── */}
      {message && !isLoginForm && (
        <span id="loginResult" className={isError ? 'error' : 'success'}>
          {message}
        </span>
      )}

      {/* ══════════════════════════════════════════
          LOGIN TAB
      ══════════════════════════════════════════ */}
      {isLoginForm && (
        <div className="tab-panel">
          <span id="inner-title">Welcome Back</span>
          <input
            id="loginName"
            type="text"
            placeholder="Username"
            value={loginName}
            onChange={(e) => setLoginName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') doLogin(); }}
          />
          {/* Password with eye toggle */}
          <div className="field-wrap">
            <div className="password-input-wrap">
              <input
                id="loginPassword"
                type={showLoginPassword ? 'text' : 'password'}
                placeholder="Password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') doLogin(); }}
              />
              <EyeToggle show={showLoginPassword} onToggle={() => setShowLoginPassword(p => !p)} />
            </div>
          </div>
          {/* Inline error — between password and button */}
          {message && (
            <span id="loginResult" className={isError ? 'error' : 'success'}>
              {message}
            </span>
          )}
          <input
            type="button"
            id="loginButton"
            value="Log In"
            onClick={doLogin}
          />
          <span
            className="auth-link"
            onClick={() => { setLoginView('forgot-password'); setMessage(''); }}
          >
            Forgot Password?
          </span>
        </div>
      )}

      {/* ── Forgot Password — lookup ── */}
      {activeTab === 'login' && loginView === 'forgot-password' && forgotStep === 'lookup' && (
        <div className="tab-panel">
          <span id="inner-title">Reset Password</span>
          <p className="auth-info">Enter your username to receive a reset code.</p>
          <input
            id="forgotEmail"
            type="text"
            placeholder="Username"
            value={resetIdentifier}
            onChange={(e) => setResetIdentifier(e.target.value)}
          />
          <input
            type="button"
            id="forgotButton"
            value="Send Reset Code"
            onClick={doRequestResetCode}
          />
          <span className="auth-link" onClick={() => { setLoginView('form'); setMessage(''); }}>
            ← Back to Login
          </span>
        </div>
      )}

      {/* ── Forgot Password — enter code ── */}
      {activeTab === 'login' && loginView === 'forgot-password' && forgotStep === 'code' && (
        <div className="tab-panel">
          <span id="inner-title">Enter Reset Code</span>
          <p className="auth-info">Enter the 6-digit code sent to {resetMaskedEmail || 'your email'}.</p>
          <input
            type="text"
            placeholder="6-digit code"
            value={resetCode}
            onChange={(e) => setResetCode(e.target.value)}
            maxLength={6}
          />
          <input
            type="button"
            id="resetButton"
            value="Verify Code"
            onClick={doVerifyResetCode}
          />
          <span className="auth-link" onClick={() => { setForgotStep('lookup'); setMessage(''); }}>
            ← Back
          </span>
        </div>
      )}

      {/* ── Forgot Password — new password ── */}
      {activeTab === 'login' && loginView === 'forgot-password' && forgotStep === 'newpass' && (
        <div className="tab-panel">
          <span id="inner-title">Set New Password</span>

          {/* New password */}
          <div className="field-wrap">
            <div className="password-input-wrap">
              <input
                type={showNewPassword ? 'text' : 'password'}
                placeholder="New Password"
                className={fieldErrors.newPassword ? 'input-error' : ''}
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setFieldErrors(p => ({ ...p, newPassword: '' })); }}
                onFocus={() => setActiveField('newPassword')}
                onBlur={() => setActiveField(null)}
              />
              <EyeToggle show={showNewPassword} onToggle={() => setShowNewPassword(p => !p)} />
            </div>
            {fieldErrors.newPassword && (fieldErrors.newPassword === 'invalid' || fieldErrors.newPassword === 'required') ? (
              <div className="field-error-msg">
                {fieldErrors.newPassword === 'required'
                  ? 'New password is required.'
                  : <>Your password is missing:
                    <ul className="field-rules-inline">
                      {validatePassword(newPassword).map(e => <li key={e}>{e}</li>)}
                    </ul>
                  </>
                }
              </div>
            ) : fieldErrors.newPassword ? (
              <p className="field-error-msg">{fieldErrors.newPassword}</p>
            ) : null}
            {activeField === 'newPassword' && (
              <ul className="field-rules">
                {pwRules.map(r => (
                  <li key={r.label} className={r.ok(newPassword) ? 'rule-ok' : 'rule-pending'}>
                    {r.ok(newPassword) ? '✓' : '·'} {r.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Confirm password */}
          <div className="field-wrap">
            <div className="password-input-wrap">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm Password"
                className={fieldErrors.confirmPassword ? 'input-error' : ''}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors(p => ({ ...p, confirmPassword: '' })); }}
              />
              <EyeToggle show={showConfirmPassword} onToggle={() => setShowConfirmPassword(p => !p)} />
            </div>
            {fieldErrors.confirmPassword && (
              <p className="field-error-msg">{fieldErrors.confirmPassword}</p>
            )}
          </div>

          <input
            type="button"
            id="resetButton"
            value="Reset Password"
            onClick={doResetPassword}
          />
        </div>
      )}

      {/* ── Resend Verification ── */}
      {activeTab === 'login' && loginView === 'resend-verification' && (
        <div className="tab-panel">
          <span id="inner-title">Verify Email</span>
          <p className="auth-info">
            Enter the 6-digit code sent to {verificationMaskedEmail || 'your email'}.
          </p>
          <input
            type="text"
            placeholder="6-digit code"
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value)}
            maxLength={6}
          />
          <input
            type="button"
            id="verifyButton"
            value="Verify Email"
            onClick={doVerifyCode}
          />
          <span className="auth-link" onClick={() => doResendVerification()}>
            Resend code
          </span>
          <span className="auth-link" onClick={() => { setLoginView('form'); setMessage(''); }}>
            ← Back to Login
          </span>
        </div>
      )}

      {/* ══════════════════════════════════════════
          REGISTER TAB
      ══════════════════════════════════════════ */}
      {activeTab === 'register' && !showVerifyBox && (
        <div className="tab-panel">
          <span id="inner-title">Create Account</span>

          {/* First Name */}
          <div className="field-wrap">
            <input
              id="regFirstName"
              type="text"
              placeholder="First Name"
              className={fieldErrors.regFirstName ? 'input-error' : ''}
              value={regFirstName}
              onChange={(e) => { setRegFirstName(e.target.value); setFieldErrors(p => ({ ...p, regFirstName: '' })); }}
            />
            {fieldErrors.regFirstName && <p className="field-error-msg">{fieldErrors.regFirstName}</p>}
          </div>

          {/* Last Name */}
          <div className="field-wrap">
            <input
              id="regLastName"
              type="text"
              placeholder="Last Name"
              className={fieldErrors.regLastName ? 'input-error' : ''}
              value={regLastName}
              onChange={(e) => { setRegLastName(e.target.value); setFieldErrors(p => ({ ...p, regLastName: '' })); }}
            />
            {fieldErrors.regLastName && <p className="field-error-msg">{fieldErrors.regLastName}</p>}
          </div>

          {/* Display Name */}
          <div className="field-wrap">
            <input
              id="regDisplayName"
              type="text"
              placeholder="Display Name"
              className={fieldErrors.regDisplayName ? 'input-error' : ''}
              value={regDisplayName}
              onChange={(e) => { setRegDisplayName(e.target.value); setFieldErrors(p => ({ ...p, regDisplayName: '' })); }}
            />
            {fieldErrors.regDisplayName && <p className="field-error-msg">{fieldErrors.regDisplayName}</p>}
          </div>

          {/* Email */}
          <div className="field-wrap">
            <input
              id="regEmail"
              type="email"
              placeholder="Email"
              className={fieldErrors.regEmail ? 'input-error' : ''}
              value={regEmail}
              onChange={(e) => { setRegEmail(e.target.value); setFieldErrors(p => ({ ...p, regEmail: '' })); }}
            />
            {fieldErrors.regEmail && <p className="field-error-msg">{fieldErrors.regEmail}</p>}
          </div>

          {/* Username */}
          <div className="field-wrap">
            <input
              id="regUsername"
              type="text"
              placeholder="Username"
              className={fieldErrors.regUsername ? 'input-error' : ''}
              value={regUsername}
              onChange={(e) => { setRegUsername(e.target.value); setFieldErrors(p => ({ ...p, regUsername: '' })); }}
              onFocus={() => setActiveField('regUsername')}
              onBlur={() => setActiveField(null)}
            />
            {fieldErrors.regUsername && <p className="field-error-msg">{fieldErrors.regUsername}</p>}
            {activeField === 'regUsername' && (
              <ul className="field-rules">
                {uRules.map(r => (
                  <li key={r.label} className={r.ok(regUsername) ? 'rule-ok' : 'rule-pending'}>
                    {r.ok(regUsername) ? '✓' : '·'} {r.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Password */}
          <div className="field-wrap">
            <div className="password-input-wrap">
              <input
                id="regPassword"
                type={showRegPassword ? 'text' : 'password'}
                placeholder="Password"
                className={fieldErrors.regPassword ? 'input-error' : ''}
                value={regPassword}
                onChange={(e) => { setRegPassword(e.target.value); setFieldErrors(p => ({ ...p, regPassword: '' })); }}
                onFocus={() => setActiveField('regPassword')}
                onBlur={() => setActiveField(null)}
              />
              <EyeToggle show={showRegPassword} onToggle={() => setShowRegPassword(p => !p)} />
            </div>
            {fieldErrors.regPassword && (fieldErrors.regPassword === 'invalid' || fieldErrors.regPassword === 'required') ? (
              <div className="field-error-msg">
                {fieldErrors.regPassword === 'required'
                  ? 'Password is required.'
                  : <>Your password is missing:
                    <ul className="field-rules-inline">
                      {validatePassword(regPassword).map(e => <li key={e}>{e}</li>)}
                    </ul>
                  </>
                }
              </div>
            ) : fieldErrors.regPassword ? (
              <p className="field-error-msg">{fieldErrors.regPassword}</p>
            ) : null}
            {activeField === 'regPassword' && (
              <ul className="field-rules">
                {pwRules.map(r => (
                  <li key={r.label} className={r.ok(regPassword) ? 'rule-ok' : 'rule-pending'}>
                    {r.ok(regPassword) ? '✓' : '·'} {r.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <input
            type="button"
            id="registerButton"
            value="Register"
            onClick={doRegister}
          />
        </div>
      )}

      {/* ── Post-register verification ── */}
      {activeTab === 'register' && showVerifyBox && (
        <div className="tab-panel info-box">
          <span id="inner-title">Verify Your Email</span>
          <p className="auth-info">
            A verification email with a 6-digit code was sent to {verificationMaskedEmail || 'your email'}. Enter it below.
          </p>
          <input
            type="text"
            placeholder="6-digit code"
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value)}
            maxLength={6}
          />
          <input
            type="button"
            id="verifyButton"
            value="Verify Email"
            onClick={doVerifyCode}
          />
          <span className="auth-link" onClick={() => doResendVerification()}>
            Resend code
          </span>
        </div>
      )}
    </div>
  );
}

export default Login;
