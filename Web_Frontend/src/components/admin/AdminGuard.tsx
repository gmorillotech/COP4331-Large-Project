import { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { apiUrl } from '../../config';

type AuthStatus = 'loading' | 'admin' | 'denied' | 'noauth';

function AdminGuard() {
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setStatus('noauth');
      return;
    }

    let cancelled = false;

    fetch(apiUrl('/api/auth/profile'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('unauthorized');
        return res.json() as Promise<{ role?: string }>;
      })
      .then((data) => {
        if (!cancelled) {
          setStatus(data.role === 'admin' ? 'admin' : 'denied');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('noauth');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0B0F17',
          color: '#94a3b8',
          fontSize: '0.95rem',
          zIndex: 1,
        }}
      >
        Verifying access...
      </div>
    );
  }

  if (status === 'noauth') {
    return <Navigate to="/" replace />;
  }

  if (status === 'denied') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Access Denied</h2>
        <p>You do not have admin privileges.</p>
        <RedirectAfterDelay to="/" ms={1500} />
      </div>
    );
  }

  return <Outlet />;
}

function RedirectAfterDelay({ to, ms }: { to: string; ms: number }) {
  const [redirect, setRedirect] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setRedirect(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);

  if (redirect) {
    return <Navigate to={to} replace />;
  }

  return null;
}

export default AdminGuard;
