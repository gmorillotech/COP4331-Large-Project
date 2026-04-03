import type { MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';

type StoredUser = {
  firstName?: string;
  lastName?: string;
};

function LoggedInName() {
  const navigate = useNavigate();
  const storedUser = localStorage.getItem('user_data');
  let displayName = 'Guest User';

  if (storedUser) {
    try {
      const user: StoredUser = JSON.parse(storedUser);
      const firstName = user.firstName?.trim() ?? '';
      const lastName = user.lastName?.trim() ?? '';
      displayName = `${firstName} ${lastName}`.trim() || 'Guest User';
    } catch {
      displayName = 'Guest User';
    }
  }

  function doLogout(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
    localStorage.removeItem('user_data');
    navigate('/');
  }

  return (
    <div id="loggedInDiv">
      <span id="userName">Logged In As {displayName}</span>
      <br />
      <button type="button" id="logoutButton" className="buttons" onClick={doLogout}>
        Log Out
      </button>
    </div>
  );
}

export default LoggedInName;
