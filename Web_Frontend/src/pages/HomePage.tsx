import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import MapExplorer from '../components/map/index.ts';
import ProfilePanel from '../components/ProfilePanel';
import './HomePage.css';

function getName(raw: string | null): string {
  if (!raw) return 'User';
  try {
    const u = JSON.parse(raw);
    if (u.displayName?.trim()) return u.displayName.trim();
    const first = u.firstName?.trim() ?? '';
    const last  = u.lastName?.trim()  ?? '';
    return `${first} ${last}`.trim() || 'User';
  } catch { return 'User'; }
}

function isAdmin(): boolean {
  try {
    const data = JSON.parse(localStorage.getItem('user_data') ?? '{}');
    return data.role === 'admin';
  } catch {
    return false;
  }
}

function HomePage() {
  const navigate = useNavigate();
  const [name, setName] = useState(() => getName(localStorage.getItem('user_data')));
  const [profileOpen, setProfileOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [admin, setAdmin] = useState(() => isAdmin());

  useEffect(() => {
    function onStorage() {
      setName(getName(localStorage.getItem('user_data')));
      setAdmin(isAdmin());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function doLogout() {
    localStorage.removeItem('user_data');
    localStorage.removeItem('token');
    navigate('/');
  }

  return (
    <div className="home-wrapper">

      {/* ── Dashboard bar ── */}
      <header className="dashboard-bar">
        <span className="dash-welcome">Welcome Back, {name}</span>

        <div className="dash-actions">
          {/* Favorites */}
          <button
            type="button"
            className="dash-icon-btn"
            onClick={() => setFavoritesOpen(true)}
            aria-label="Open favorites"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>

          <span className="dash-divider" aria-hidden="true" />

          {/* Profile */}
          <button
            type="button"
            className="dash-icon-btn"
            onClick={() => setProfileOpen(true)}
            aria-label="Open profile"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
            </svg>
          </button>

          <span className="dash-divider" aria-hidden="true" />

          {/* Microphone / data collection */}
          <button
            type="button"
            className="dash-icon-btn"
            onClick={() => navigate('/collect')}
            aria-label="Start data collection session"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
          </button>

          <span className="dash-divider" aria-hidden="true" />

          {/* Admin Panel — only visible to admins */}
          {admin && (
            <>
              <Link to="/admin" className="dash-admin-btn" aria-label="Go to admin panel">
                Admin
              </Link>
              <span className="dash-divider" aria-hidden="true" />
            </>
          )}

          {/* Logout */}
          <button
            type="button"
            className="dash-icon-btn"
            onClick={doLogout}
            aria-label="Log out"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zm-5 11H5V6h7V4H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7v-2z"/>
            </svg>
          </button>
        </div>
      </header>

      {/* ── Map (fills remaining screen) ── */}
      <div className="home-map-container">
        <MapExplorer
          favoritesOpen={favoritesOpen}
          onFavoritesClose={() => setFavoritesOpen(false)}
        />
      </div>

      {/* ── Profile panel (slides from right) ── */}
      <ProfilePanel
        externalOpen={profileOpen}
        onExternalClose={() => setProfileOpen(false)}
      />

    </div>
  );
}

export default HomePage;
