import { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';

type UserData = {
  role?: string;
};

function getAuthStatus(): 'admin' | 'denied' | 'noauth' {
  const raw = localStorage.getItem('user_data');
  if (!raw) return 'noauth';
  try {
    const user: UserData = JSON.parse(raw);
    return user.role === 'admin' ? 'admin' : 'denied';
  } catch {
    return 'noauth';
  }
}

function AdminGuard() {
  const status = getAuthStatus();

  if (status === 'noauth') {
    return <Navigate to="/" replace />;
  }

  if (status === 'denied') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Access Denied</h2>
        <p>You do not have admin privileges.</p>
        <p>Redirecting&hellip;</p>
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
