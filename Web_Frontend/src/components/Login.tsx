import type { ChangeEvent, MouseEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../config';
import { maskEmail } from '../utils/emailMask';
import './Login.css';

type Tab = 'login' | 'register';
type LoginView = 'form' | 'forgot-password' | 'resend-verification';

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
};

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

  const [forgotStep, setForgotStep] = useState<'lookup' | 'code' | 'newpass'>('lookup');
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetMaskedEmail, setResetMaskedEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const navigate = useNavigate();

  function showSuccess(msg: string): void {
    setIsError(false);
    setMessage(msg);
  }

  function showError(msg: string): void {
    setIsError(true);
    setMessage(msg);
  }

  function resetForgotPasswordState(): void {
    setForgotStep('lookup');
    setResetIdentifier('');
    setResetEmail('');
    setResetMaskedEmail('');
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
  }

  function resetVerificationState(): void {
    setVerifyCode('');
    setVerificationEmail('');
    setVerificationMaskedEmail('');
  }

  function handleTabSwitch(tab: Tab): void {
    setActiveTab(tab);
    setLoginView('form');
    setMessage('');
    setIsError(false);
    setShowVerifyBox(false);
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

        if (res.reason === 'forced_reset') {
          setLoginView('forgot-password');
          setResetIdentifier(loginName.trim());
          setResetEmail(resolvedEmail);
          setResetMaskedEmail(resolvedMaskedEmail);
          setResetCode('');
          setNewPassword('');
          setConfirmPassword('');
          setForgotStep('code');
          showError(
            resolvedMaskedEmail
              ? `Enter the 6-digit code sent to ${resolvedMaskedEmail}.`
              : errorMsg || 'A password reset is required for this account.',
          );
          return;
        }

        if (res.reason === 'email_not_verified' || errorMsg.toLowerCase().includes('verify')) {
          setLoginView('resend-verification');
          setVerificationEmail(resolvedEmail);
          setVerificationMaskedEmail(resolvedMaskedEmail);
          setVerifyCode('');
          showError(
            resolvedMaskedEmail
              ? `Enter the 6-digit code sent to ${resolvedMaskedEmail}.`
              : 'Your account is not verified. Enter the 6-digit code sent to your email.',
          );
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

    if (!regUsername || !regEmail || !regPassword) {
      showError('Username, email, and password are required.');
      return;
    }

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

      if (!response.ok) {
        showError(res.error || 'Failed to send reset code.');
        return;
      }

      if (!res.email) {
        showSuccess(res.message || 'If an account exists, a reset code has been sent.');
        return;
      }

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

    if (!resetCode.trim()) {
      showError('Please enter the reset code.');
      return;
    }

    setForgotStep('newpass');
    setMessage('');
  }

  async function doResetPassword(event?: MouseEvent<HTMLInputElement>): Promise<void> {
    event?.preventDefault();

    if (!resetEmail) {
      showError('We could not determine which account to reset. Please start again.');
      return;
    }
    if (!newPassword || !confirmPassword) {
      showError('Please fill in both password fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showError('Passwords do not match.');
      return;
    }

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
      setTimeout(() => {
        setLoginView('form');
        resetForgotPasswordState();
      }, 2500);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to contact the server');
    }
  }

  async function doResendVerification(event?: MouseEvent<HTMLInputElement>): Promise<void> {
    event?.preventDefault();

    const targetEmail = verificationEmail.trim().toLowerCase();
    if (!targetEmail) {
      showError('We could not determine which email to verify. Please try logging in again.');
      return;
    }

    try {
      const response = await fetch(apiUrl('/api/auth/resend-verification'), {
        method: 'POST',
        body: JSON.stringify({ email: targetEmail }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res: GenericResponse = await response.json();

      if (!response.ok) {
        showError(res.error || 'Unable to resend verification code.');
        return;
      }

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

    if (!verifyCode.trim()) {
      showError('Please enter the verification code.');
      return;
    }
    if (!verificationEmail) {
      showError('We could not determine which email to verify. Please request a new code.');
      return;
    }

    try {
      const response = await fetch(apiUrl('/api/auth/verify-email'), {
        method: 'POST',
        body: JSON.stringify({ email: verificationEmail, code: verifyCode.trim() }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res: GenericResponse = await response.json();

      if (!response.ok) {
        showError(res.error || 'Invalid or expired code.');
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

  return (
    <div id="loginDiv">
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

      <div className="tab-panel" style={{ display: activeTab === 'login' ? 'flex' : 'none' }}>
        {loginView === 'form' && (
          <>
            <span id="inner-title">LOG IN</span>
            <br />
            <input
              type="text"
              id="loginName"
              placeholder="Username"
              value={loginName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setLoginName(e.target.value)}
            />
            <br />
            <input
              type="password"
              id="loginPassword"
              placeholder="Password"
              value={loginPassword}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setLoginPassword(e.target.value)}
            />
            <span
              className="auth-link"
              onClick={() => {
                setLoginView('forgot-password');
                setMessage('');
                setIsError(false);
                resetForgotPasswordState();
                setResetIdentifier(loginName.trim());
              }}
            >
              Forgot Password?
            </span>
            <br />
            <input
              type="submit"
              id="loginButton"
              className="buttons"
              value="Login"
              onClick={doLogin}
            />
          </>
        )}

        {loginView === 'forgot-password' && (
          <>
            <span id="inner-title">RESET PASSWORD</span>
            <br />

            {forgotStep === 'lookup' && (
              <>
                <p className="auth-info">Enter your username and we&apos;ll send you a reset code.</p>
                <input
                  type="text"
                  id="forgotUsername"
                  placeholder="Username"
                  value={resetIdentifier}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setResetIdentifier(e.target.value)}
                />
                <br />
                <input
                  type="submit"
                  className="buttons"
                  value="Send Reset Code"
                  onClick={doRequestResetCode}
                />
              </>
            )}

            {forgotStep === 'code' && (
              <>
                <div className="info-box">
                  <span className="info-box-icon">&#9993;</span>
                  <p>
                    Enter the 6-digit code sent to <strong>{resetMaskedEmail || 'your email'}</strong>.
                  </p>
                </div>
                <input
                  type="text"
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  value={resetCode}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setResetCode(e.target.value)}
                />
                <br />
                <input
                  type="submit"
                  className="buttons"
                  value="Verify Code"
                  onClick={doVerifyResetCode}
                />
                <span className="auth-link" onClick={() => void doRequestResetCode()}>
                  Resend code
                </span>
                <span
                  className="auth-link"
                  onClick={() => {
                    resetForgotPasswordState();
                    setResetIdentifier(loginName.trim());
                  }}
                >
                  Try a different username
                </span>
              </>
            )}

            {forgotStep === 'newpass' && (
              <>
                <p className="auth-info">Enter your new password below.</p>
                <input
                  type="password"
                  placeholder="New Password"
                  value={newPassword}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)}
                />
                <br />
                <input
                  type="password"
                  placeholder="Confirm New Password"
                  value={confirmPassword}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
                />
                <br />
                <input
                  type="submit"
                  className="buttons"
                  value="Reset Password"
                  onClick={doResetPassword}
                />
              </>
            )}

            <span
              className="auth-link"
              onClick={() => {
                setLoginView('form');
                setMessage('');
                setIsError(false);
                resetForgotPasswordState();
              }}
            >
              &#8592; Back to Login
            </span>
          </>
        )}

        {loginView === 'resend-verification' && (
          <>
            <span id="inner-title">VERIFY YOUR EMAIL</span>
            <br />
            <div className="info-box">
              <span className="info-box-icon">&#9993;</span>
              <p>
                Enter the 6-digit code sent to <strong>{verificationMaskedEmail || 'your email'}</strong>.
              </p>
            </div>
            <input
              type="text"
              className="reg-input"
              placeholder="Enter 6-digit code"
              maxLength={6}
              value={verifyCode}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setVerifyCode(e.target.value)}
            />
            <br />
            <input
              type="submit"
              className="buttons"
              value="Verify Account"
              onClick={doVerifyCode}
            />
            <span className="auth-link" onClick={() => void doResendVerification()}>
              Resend code
            </span>
            <span
              className="auth-link"
              onClick={() => {
                setLoginView('form');
                setMessage('');
                setIsError(false);
                resetVerificationState();
              }}
            >
              &#8592; Back to Login
            </span>
          </>
        )}
      </div>

      <div className="tab-panel" style={{ display: activeTab === 'register' ? 'flex' : 'none' }}>
        {showVerifyBox ? (
          <>
            <span id="inner-title">CHECK YOUR EMAIL</span>
            <br />
            <div className="info-box">
              <span className="info-box-icon">&#9993;</span>
              <p>
                Enter the 6-digit code sent to <strong>{verificationMaskedEmail || 'your email'}</strong>.
              </p>
            </div>
            <input
              type="text"
              id="verifyCode"
              className="reg-input"
              placeholder="Enter 6-digit code"
              maxLength={6}
              value={verifyCode}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setVerifyCode(e.target.value)}
            />
            <br />
            <input
              type="submit"
              id="verifyButton"
              className="buttons"
              value="Verify Account"
              onClick={doVerifyCode}
            />
            <span className="auth-link" onClick={() => void doResendVerification()}>
              Resend code
            </span>
          </>
        ) : (
          <>
            <span id="inner-title">REGISTER</span>
            <br />
            <input
              type="text"
              id="regFirstName"
              className="reg-input"
              placeholder="First Name"
              value={regFirstName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setRegFirstName(e.target.value)}
            />
            <br />
            <input
              type="text"
              id="regLastName"
              className="reg-input"
              placeholder="Last Name"
              value={regLastName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setRegLastName(e.target.value)}
            />
            <br />
            <input
              type="text"
              id="regDisplayName"
              className="reg-input"
              placeholder="Display Name"
              value={regDisplayName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setRegDisplayName(e.target.value)}
            />
            <br />
            <input
              type="email"
              id="regEmail"
              className="reg-input"
              placeholder="Email *"
              value={regEmail}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setRegEmail(e.target.value)}
            />
            <br />
            <input
              type="text"
              id="regUsername"
              className="reg-input"
              placeholder="Username *"
              value={regUsername}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setRegUsername(e.target.value)}
            />
            <br />
            <input
              type="password"
              id="regPassword"
              className="reg-input"
              placeholder="Password *"
              value={regPassword}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setRegPassword(e.target.value)}
            />
            <br />
            <input
              type="submit"
              id="registerButton"
              className="buttons"
              value="Create Account"
              onClick={doRegister}
            />
          </>
        )}
      </div>

      <span id="loginResult" className={isError ? 'error' : 'success'}>
        {message}
      </span>
    </div>
  );
}

export default Login;
