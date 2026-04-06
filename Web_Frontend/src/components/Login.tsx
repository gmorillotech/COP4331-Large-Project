import type { ChangeEvent, MouseEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';

type Tab = 'login' | 'register';
type LoginView = 'form' | 'forgot-password' | 'reset-password' | 'resend-verification';

type LoginResponse = {
  accessToken: string;
  user: {
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
  error?: string;
};

type RegisterResponse = {
  userId: string;
  login: string;
  email: string;
  message: string;
  error?: string;
};

type GenericResponse = {
  message?: string;
  error?: string;
};

function Login() {
  const [activeTab, setActiveTab] = useState<Tab>('login');
  const [loginView, setLoginView] = useState<LoginView>('form');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  // Login fields
  const [loginName, setLoginName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register fields
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');

  // Post-register verify email
  const [showVerifyBox, setShowVerifyBox] = useState(false);

  // Forgot / reset password
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);


  // Resend verification
  const [resendEmail, setResendEmail] = useState('');

  const navigate = useNavigate();

  function showSuccess(msg: string): void {
    setIsError(false);
    setMessage(msg);
  }

  function showError(msg: string): void {
    setIsError(true);
    setMessage(msg);
  }

  function handleTabSwitch(tab: Tab): void {
    setActiveTab(tab);
    setLoginView('form');
    setMessage('');
    setIsError(false);
    setShowVerifyBox(false);
    setForgotSent(false);
  }

  // ── LOGIN ────────────────────────────────────────────
  async function doLogin(event: MouseEvent<HTMLInputElement>): Promise<void> {
    event.preventDefault();

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ login: loginName, password: loginPassword }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res: LoginResponse = await response.json();

      if (!response.ok) {
        const errorMsg = res.error || '';
        if (errorMsg.toLowerCase().includes('verify')) {
          setLoginView('resend-verification');
          setResendEmail('');
          showError('Your account is not verified. Please check your email or resend the verification link.');
          return;
        }
        showError(errorMsg || 'User/Password combination incorrect');
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

  // ── REGISTER ─────────────────────────────────────────
  async function doRegister(event: MouseEvent<HTMLInputElement>): Promise<void> {
    event.preventDefault();

    if (!regUsername || !regEmail || !regPassword) {
      showError('Username, email, and password are required.');
      return;
    }

    try {
      const response = await fetch('/api/auth/register', {
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
      setShowVerifyBox(true);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to contact the server');
    }
  }


  // ── FORGOT PASSWORD ───────────────────────────────────
  async function doForgotPassword(event: MouseEvent<HTMLInputElement>): Promise<void> {
    event.preventDefault();

    if (!forgotEmail) {
      showError('Please enter your email address.');
      return;
    }

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: forgotEmail }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res: GenericResponse = await response.json();
      showSuccess(res.message || 'Password reset link sent to your email.');
      setForgotSent(true);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to contact the server');
    }
  }


  // ── RESEND VERIFICATION ───────────────────────────────
  async function doResendVerification(event: MouseEvent<HTMLInputElement>): Promise<void> {
    event.preventDefault();

    if (!resendEmail.trim()) {
      showError('Please enter your email address.');
      return;
    }

    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email: resendEmail.trim().toLowerCase() }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res: GenericResponse = await response.json();

      if (!response.ok) {
        showError(res.error || 'Unable to resend verification email.');
        return;
      }

      showSuccess(res.message || 'Verification email resent! Check your inbox.');
      setResendEmail('');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to contact the server');
    }
  }

  return (
    <div id="loginDiv">

      {/* TABS */}
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

      {/* ── LOGIN TAB ── */}
      <div className="tab-panel" style={{ display: activeTab === 'login' ? 'flex' : 'none' }}>

        {/* LOGIN FORM */}
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
                setForgotSent(false);
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

        {/* FORGOT PASSWORD */}
        {loginView === 'forgot-password' && (
          <>
            <span id="inner-title">FORGOT PASSWORD</span>
            <br />
              {forgotSent ? (
                <div className="info-box">
                <span className="info-box-icon">✓</span>
                <p>Password reset link sent! Check your inbox and click the link to reset your password. You will be redirected to login automatically after resetting.</p>
              </div>
            ) : (
              <>
                <p className="auth-info">Enter your email and we'll send you a reset link.</p>
                <input
                  type="email"
                  id="forgotEmail"
                  placeholder="Email Address"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
              />
          <br />
          <input
            type="submit"
            id="forgotButton"
            className="buttons"
            value="Send Reset Link"
            onClick={doForgotPassword}
          />
        </>
      )}
    <span
      className="auth-link"
      onClick={() => { setLoginView('form'); setMessage(''); setIsError(false); setForgotSent(false); }}
    >
      ← Back to Login
    </span>
  </>
    )}


        {/* RESEND VERIFICATION */}
        {loginView === 'resend-verification' && (
          <>
            <span id="inner-title">VERIFY YOUR EMAIL</span>
            <br />
            <div className="info-box">
              <span className="info-box-icon">✉</span>
              <p>Your account has not been verified yet. Enter your email below to receive a new verification link.</p>
            </div>
            <input
              type="email"
              id="resendEmail"
              placeholder="Email Address"
              value={resendEmail}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setResendEmail(e.target.value)}
            />
            <br />
            <input
              type="submit"
              id="resendButton"
              className="buttons"
              value="Resend Verification Email"
              onClick={doResendVerification}
            />
            <span
              className="auth-link"
              onClick={() => { setLoginView('form'); setMessage(''); setIsError(false); }}
            >
              ← Back to Login
            </span>
          </>
        )}
      </div>

      {/* ── REGISTER TAB ── */}
      <div className="tab-panel" style={{ display: activeTab === 'register' ? 'flex' : 'none' }}>
        {showVerifyBox ? (
          <>
            <div className="info-box">
              <span className="info-box-icon">✉</span>
              <p>Account created! A verification email has been sent to your inbox. Click the link in the email to activate your account, then come back here to log in.</p>
          </div>
          <input
            type="submit"
            id="loginButton"
            className="buttons"
            value="Back to Login"
            onClick={() => handleTabSwitch('login')}
          />
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
              onChange={(e) => setRegFirstName(e.target.value)}
            />
            <br />
            <input
              type="text"
              id="regLastName"
              className="reg-input"
              placeholder="Last Name"
              value={regLastName}
              onChange={(e) => setRegLastName(e.target.value)}
            />
            <br />
            <input
              type="text"
              id="regDisplayName"
              className="reg-input"
              placeholder="Display Name"
              value={regDisplayName}
              onChange={(e) => setRegDisplayName(e.target.value)}
            />
            <br />
            <input
              type="email"
              id="regEmail"
              className="reg-input"
              placeholder="Email *"
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
            />
            <br />
            <input
              type="text"
              id="regUsername"
              className="reg-input"
              placeholder="Username *"
              value={regUsername}
              onChange={(e) => setRegUsername(e.target.value)}
            />
            <br />
            <input
              type="password"
              id="regPassword"
              className="reg-input"
              placeholder="Password *"
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
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

      <span id="loginResult" className={isError ? 'error' : 'success'}>{message}</span>
    </div>
  );
}

export default Login;