import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from './config';
import './components/Login.css';

type GenericResponse = {
  message?: string;
  error?: string;
};

function ResetPassword() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [token, setToken] = useState('');
  const [tokenValid, setTokenValid] = useState(true);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const t = searchParams.get('token');
    if (!t) {
      setTokenValid(false);
      setIsError(true);
      setMessage('Invalid or missing reset token. Please request a new password reset.');
    } else {
      setToken(t);
    }
  }, [searchParams]);

  async function handleReset(e: React.MouseEvent<HTMLInputElement>) {
    e.preventDefault();

    if (!newPassword || !confirmPassword) {
      setIsError(true);
      setMessage('Please fill in both fields.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setIsError(true);
      setMessage('Passwords do not match.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res: GenericResponse = await response.json();

      if (!response.ok) {
        setIsError(true);
        setMessage(res.error || 'Reset failed. Your token may have expired.');
        return;
      }

      setIsError(false);
      setMessage('Password reset successful! Redirecting to login in 3 seconds...');
      setTimeout(() => navigate('/'), 3000);
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'Unable to contact the server');
    }
  }

  return (
    <div id="loginDiv">
      <span id="inner-title">RESET PASSWORD</span>
      <br />
      {tokenValid ? (
        <>
          <p className="auth-info" style={{ marginTop: '16px' }}>
            Enter your new password below.
          </p>
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
            id="resetButton"
            className="buttons"
            value="Reset Password"
            onClick={handleReset}
          />
        </>
      ) : (
        <input
          type="submit"
          id="loginButton"
          className="buttons"
          value="Back to Login"
          onClick={() => navigate('/')}
        />
      )}
      {message && (
        <span
          id="loginResult"
          className={isError ? 'error' : 'success'}
          style={{ marginTop: '12px' }}
        >
          {message}
        </span>
      )}
    </div>
  );
}

export default ResetPassword;