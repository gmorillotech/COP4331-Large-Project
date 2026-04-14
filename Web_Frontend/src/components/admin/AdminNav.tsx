import { NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

type StoredUser = {
  displayName?: string;
  firstName?: string;
  lastName?: string;
};

function getDisplayName(raw: string | null): string {
  if (!raw) return 'Admin';
  try {
    const user: StoredUser = JSON.parse(raw);
    if (user.displayName?.trim()) return user.displayName.trim();
    const first = user.firstName?.trim() ?? '';
    const last = user.lastName?.trim() ?? '';
    return `${first} ${last}`.trim() || 'Admin';
  } catch {
    return 'Admin';
  }
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'A';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function AdminNav() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(() =>
    getDisplayName(localStorage.getItem('user_data')),
  );

  useEffect(() => {
    function onStorage() {
      setDisplayName(getDisplayName(localStorage.getItem('user_data')));
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user_data');
    navigate('/');
  }

  return (
    <header className="admin-header">
      <div className="admin-header-left">
        <span className="admin-badge">ADMIN</span>
        <nav className="admin-nav-links">
          <NavLink
            to="/admin"
            end
            className={({ isActive }) => (isActive ? 'admin-nav-link active' : 'admin-nav-link')}
          >
            Admin Search
          </NavLink>
          <NavLink
            to="/admin/users"
            className={({ isActive }) => (isActive ? 'admin-nav-link active' : 'admin-nav-link')}
          >
            Manage Users
          </NavLink>
          <NavLink
            to="/admin/locations"
            className={({ isActive }) => (isActive ? 'admin-nav-link active' : 'admin-nav-link')}
          >
            Location Edit
          </NavLink>
        </nav>
      </div>
      <div className="admin-header-right">
        <div className="admin-user-chip" title={displayName}>
          <span className="admin-user-chip__avatar" aria-hidden="true">
            {getInitials(displayName)}
          </span>
          <span className="admin-user-chip__name">{displayName}</span>
        </div>
        <NavLink to="/home" className="admin-nav-link admin-back-link">
          ← App
        </NavLink>
        <button type="button" className="admin-logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}

export default AdminNav;
