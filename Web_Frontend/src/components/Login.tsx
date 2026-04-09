import type { ChangeEvent, MouseEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../config';
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
  const [verifyCode, setVerifyCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState('');

  // Forgot / reset password
  const [forgotStep, setForgotStep] = useState<'email' | 'code' | 'newpass'>('email');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

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
    setForgotStep('email');   // ← add
    setResetEmail('');         // ← add
    setResetCode('');          // ← add
    setNewPassword('');        // ← add
    setConfirmPassword('');    // ← add
  }

  // ── LOGIN ────────────────────────────────────────────
  async function doLogin(event: MouseEvent<HTMLInputElement>): Promise<void> {
    event.preventDefault();

    try {
      const response = await fetch(apiUrl('/api/auth/login'), {
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
          showError('Your account is not verified. Please check your email for a 6-digit code or resend it.');
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
      setVerifiedEmail(regEmail.trim().toLowerCase());
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
  async function doVerifyResetCode(event: MouseEvent<HTMLInputElement>): Promise<void> {
  event.preventDefault();
  if (!resetCode.trim()) {
    showError('Please enter the reset code.');
    return;
  }
  // Code is validated on submit of new password, just advance the step
  setForgotStep('newpass');
  setMessage('');
}

async function doResetPassword(event: MouseEvent<HTMLInputElement>): Promise<void> {
  event.preventDefault();
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
      setForgotStep('code'); // send them back to re-enter the code
      return;
    }
    showSuccess('Password reset! You can now log in.');
    setTimeout(() => {
      setLoginView('form');
      setForgotStep('email');
      setResetEmail('');
      setResetCode('');
      setNewPassword('');
      setConfirmPassword('');
    }, 2500);
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
      const response = await fetch(apiUrl('/api/auth/resend-verification'), {
        method: 'POST',
        body: JSON.stringify({ email: resendEmail.trim().toLowerCase() }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res: GenericResponse = await response.json();

      if (!response.ok) {
        showError(res.error || 'Unable to resend verification code.');
        return;
      }

      setVerifiedEmail(resendEmail.trim().toLowerCase());
      showSuccess('Code sent! Check your inbox.');
      setCodeSent(true);
      setResendEmail('');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to contact the server');
    }
  }

async function doVerifyCode(event: MouseEvent<HTMLInputElement>): Promise<void> {
  event.preventDefault();
  if (!verifyCode.trim()) {
    showError('Please enter the verification code.');
    return;
  }
  // const emailToVerify = showVerifyBox ? regEmail : resendEmail || '';
  const emailToVerify = verifiedEmail;
  try {
    const response = await fetch(apiUrl('/api/auth/verify-email'), {
      method: 'POST',
      body: JSON.stringify({ email: emailToVerify, code: verifyCode.trim() }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res: GenericResponse = await response.json();
    if (!response.ok) {
      showError(res.error || 'Invalid or expired code.');
      return;
    }
    showSuccess('Email verified! You can now log in.');
    setVerifyCode('');
    setCodeSent(false);
    handleTabSwitch('login');
    setTimeout(() => handleTabSwitch('login'), 2500);
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
    <span id="inner-title">RESET PASSWORD</span>
    <br />

    {/* STEP 1 — Enter email */}
    {forgotStep === 'email' && (
      <>
        <p className="auth-info">Enter your email and we'll send you a reset code.</p>
        <input
          type="email"
          id="forgotEmail"
          placeholder="Email Address"
          value={resetEmail}
          onChange={(e) => setResetEmail(e.target.value)}
        />
        <br />
        <input
          type="submit"
          className="buttons"
          value="Send Reset Code"
          onClick={async (e) => {
            e.preventDefault();
            if (!resetEmail) { showError('Please enter your email.'); return; }
            const response = await fetch(apiUrl('/api/auth/forgot-password'), {
              method: 'POST',
              body: JSON.stringify({ email: resetEmail }),
              headers: { 'Content-Type': 'application/json' },
            });
            const res: GenericResponse = await response.json();
            showSuccess(res.message || 'Code sent! Check your inbox.');
            setForgotStep('code');
          }}
        />
      </>
    )}

    {/* STEP 2 — Enter code */}
    {forgotStep === 'code' && (
      <>
        <div className="info-box">
          <span className="info-box-icon">✉</span>
          <p>We sent a 6-digit code to {resetEmail}. Enter it below.</p>
        </div>
        <input
          type="text"
          placeholder="Enter 6-digit code"
          maxLength={6}
          value={resetCode}
          onChange={(e) => setResetCode(e.target.value)}
        />
        <br />
        <input
          type="submit"
          className="buttons"
          value="Verify Code"
          onClick={doVerifyResetCode}
        />
        <span className="auth-link" onClick={() => setForgotStep('email')}>
          ← Use a different email
        </span>
      </>
    )}

    {/* STEP 3 — Enter new password */}
    {forgotStep === 'newpass' && (
      <>
        <p className="auth-info">Enter your new password below.</p>
        <input
          type="password"
          placeholder="New Password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <br />
        <input
          type="password"
          placeholder="Confirm New Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
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
      onClick={() => { setLoginView('form'); setMessage(''); setIsError(false); setForgotStep('email'); }}
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
    {!codeSent ? (
      <>
        <div className="info-box">
          <span className="info-box-icon">✉</span>
          <p>Enter your email below to receive a 6-digit verification code.</p>
        </div>
        <input
          type="email"
          placeholder="Email Address"
          value={resendEmail}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setResendEmail(e.target.value)}
        />
        <br />
        <input
          type="submit"
          className="buttons"
          value="Send Verification Code"
          onClick={doResendVerification}
        />
      </>
    ) : (
      <>
        <div className="info-box">
          <span className="info-box-icon">✉</span>
          <p>Check your email for a 6-digit code and enter it below.</p>
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
        <span className="auth-link" onClick={() => setCodeSent(false)}>
          ← Use a different email
        </span>
      </>
    )}
    <span
      className="auth-link"
      onClick={() => { setLoginView('form'); setMessage(''); setIsError(false); setCodeSent(false); }}
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
    <span id="inner-title">CHECK YOUR EMAIL</span>
    <br />
    <div className="info-box">
      <span className="info-box-icon">✉</span>
      {/* OLD: <p>Account created! A verification email has been sent to your inbox. Click the link in the email to activate your account, then come back here to log in.</p> */}
      <p>Account created! We sent a 6-digit code to your email. Enter it below to verify your account.</p>
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
    <span
      className="auth-link"
      onClick={doResendVerification.bind(null, { preventDefault: () => {} } as any)}
    >
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
