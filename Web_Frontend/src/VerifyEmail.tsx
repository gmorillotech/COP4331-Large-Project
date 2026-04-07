import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from './config';
import './components/Login.css';

function VerifyEmail() {
  const [message, setMessage] = useState('Verifying your email, please wait...');
  const [isError, setIsError] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const token = searchParams.get('token');
    if (!token) {
      setIsError(true);
      setMessage('Invalid verification link. Please request a new one.');
      return;
    }

    async function verify() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/verify-email`, {
          method: 'POST',
          body: JSON.stringify({ token }),
          headers: { 'Content-Type': 'application/json' },
        });

        const res = await response.json();

        if (!response.ok) {
          setIsError(true);
          setMessage(res.error || 'Verification failed. The link may have expired.');
          return;
        }

        setIsError(false);
        setMessage('Your email has been verified! You can now log in. Redirecting in 3 seconds...');
        setTimeout(() => navigate('/'), 3000);
      } catch {
        setIsError(true);
        setMessage('Server error. Please try again later.');
      }
    }

    verify();
  }, [searchParams, navigate]);

  return (
    <div id="loginDiv">
      <span id="inner-title">
        {isError ? 'VERIFICATION FAILED' : 'EMAIL VERIFIED'}
      </span>
      <br />
      <p className="auth-info" style={{ marginTop: '16px' }}>{message}</p>
      <input
        type="submit"
        className="buttons"
        id="loginButton"
        value="Back to Login"
        onClick={() => navigate('/')}
      />
    </div>
  );
}

export default VerifyEmail;