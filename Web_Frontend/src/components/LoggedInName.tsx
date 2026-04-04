import type { MouseEvent } from 'react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './LoggedInName.css';

type StoredUser = {
  firstName?: string;
  lastName?: string;
  displayName?: string;
};

function getName(storedUser: string | null): string {
  if (!storedUser) return 'Guest User';
  try {
    const user: StoredUser = JSON.parse(storedUser);
    if (user.displayName?.trim()) return user.displayName.trim();
    const firstName = user.firstName?.trim() ?? '';
    const lastName = user.lastName?.trim() ?? '';
    return `${firstName} ${lastName}`.trim() || 'Guest User';
  } catch {
    return 'Guest User';
  }
}

function LoggedInName() {
  const navigate = useNavigate();
  const [name, setName] = useState(() => getName(localStorage.getItem('user_data')));

  useEffect(() => {
    function handleStorageChange() {
      setName(getName(localStorage.getItem('user_data')));
    }

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  function doLogout(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
    localStorage.removeItem('user_data');
    navigate('/');
  }

  return (
    <div id="loggedInDiv">
      <span id="userName">Welcome Back, {name}</span>
      <br />
      <button type="button" id="logoutButton" className="buttons" onClick={doLogout}>
        Log Out
      </button>
    </div>
  );
}

export default LoggedInName;