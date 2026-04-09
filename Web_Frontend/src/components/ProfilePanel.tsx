import { useState, useEffect, useRef } from 'react';
import { apiUrl } from '../config';
import './ProfilePanel.css';

type User = {
  userId: string;
  login: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  favorites: string[];
  userNoiseWF: number;
  userOccupancyWF: number;
  createdAt: string;
};

type GenericResponse = {
  message?: string;
  error?: string;
};

function ProfilePanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<'profile' | 'editDisplay' | 'editEmail' | 'forgotSent'>('profile');
  const [displayName, setDisplayName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const [resetStep, setResetStep] = useState<'idle' | 'code' | 'newpass'>('idle');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  function showSuccess(msg: string) { setIsError(false); setMessage(msg); }
  function showError(msg: string) { setIsError(true); setMessage(msg); }

  // Load user from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('user_data');
    if (stored) {
      const parsed = JSON.parse(stored);
      setUser(parsed);
      setDisplayName(parsed.displayName || '');
    }

    async function fetchProfile() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(apiUrl('/api/auth/profile'), {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) return;
            const fresh = await response.json();
            setUser(fresh);
            setDisplayName(fresh.displayName || '');
            localStorage.setItem('user_data', JSON.stringify(fresh));
        } catch {
      // silently fall back to localStorage data
        }
    }

     fetchProfile();


  }, []);

  // Close panel when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        handleClose();
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  function handleClose() {
    setIsOpen(false);
    setView('profile');
    setMessage('');
    setIsError(false);
    setNewEmail('');
    setResetStep('idle');   
    setResetCode('');       
    setNewPassword('');   
    setConfirmPassword('');  
  }

  function formatDate(dateStr: string): string {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function getInitials(): string {
    if (!user) return '?';
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user.displayName) return user.displayName[0].toUpperCase();
    if (user.login) return user.login[0].toUpperCase();
    return '?';
  }

  // ── UPDATE DISPLAY NAME ───────────────────────────────
  async function doUpdateDisplayName() {
    if (!displayName.trim()) {
      showError('Display name cannot be empty.');
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(apiUrl('/api/auth/profile'), {
        method: 'PUT',
        body: JSON.stringify({ displayName: displayName.trim() }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const res = await response.json();

      if (!response.ok) {
        showError(res.error || 'Failed to update display name.');
        return;
      }

      const updatedUser = { ...user!, displayName: displayName.trim() };
      setUser(updatedUser);
      localStorage.setItem('user_data', JSON.stringify(updatedUser));
      window.dispatchEvent(new Event('storage'));
      showSuccess('Display name updated successfully!');
      setTimeout(() => { setView('profile'); setMessage(''); }, 1500);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to contact the server');
    } finally {
      setLoading(false);
    }
  }

  // ── RESET PASSWORD (sends email link) ─────────────────
  async function doResetPassword() {
    if (!user?.email) return;
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/auth/forgot-password'), {
        method: 'POST',
        body: JSON.stringify({ email: user.email }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res: GenericResponse = await response.json();
      if (!response.ok) {
        showError(res.error || 'Failed to send reset code.');
        return;
      }
      showSuccess('Reset code sent to your email!');
      setResetStep('code');
      setView('forgotSent');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to contact the server');
    } finally {
      setLoading(false);
    }
  }

  async function doSubmitResetCode() {
    if (!resetCode.trim()) { showError('Please enter the code.'); return; }
    setResetStep('newpass');
    setMessage('');
  }

  async function doSubmitNewPassword() {
    if (!newPassword || !confirmPassword) { showError('Please fill in both fields.'); return; }
    if (newPassword !== confirmPassword) { showError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/auth/reset-password'), {
        method: 'POST',
        body: JSON.stringify({ email: user?.email, code: resetCode, newPassword }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res: GenericResponse = await response.json();
      if (!response.ok) {
        showError(res.error || 'Invalid or expired code.');
        setResetStep('code');
        return;
      }
      showSuccess('Password reset successfully!');
      setTimeout(() => { setView('profile'); setResetStep('idle'); setMessage(''); }, 2500);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to contact the server');
    } finally {
      setLoading(false);
    }
  }

  // ── UPDATE EMAIL ──────────────────────────────────────
  async function doUpdateEmail() {
    if (!newEmail.trim()) {
      showError('Please enter a new email address.');
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(apiUrl('/api/auth/profile'), {
        method: 'PUT',
        body: JSON.stringify({ email: newEmail.trim().toLowerCase() }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const res = await response.json();

      if (!response.ok) {
        showError(res.error || 'Failed to update email.');
        return;
      }

      showSuccess('Email updated! A verification code has been sent to your new email. Please verify it before logging in again.');
      const updatedUser = { ...user!, email: newEmail.trim().toLowerCase() };
      setUser(updatedUser);
      localStorage.setItem('user_data', JSON.stringify(updatedUser));
      setNewEmail('');
      setTimeout(() => { setView('profile'); setMessage(''); }, 3000);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to contact the server');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Profile Icon Button */}
      <button
        className="profile-icon-btn"
        onClick={() => setIsOpen(true)}
        aria-label="Open profile"
      >
        <span className="profile-initials">{getInitials()}</span>
      </button>

      {/* Overlay */}
      {isOpen && <div className="profile-overlay" onClick={handleClose} />}

      {/* Slide-out Panel */}
      <div className={`profile-panel ${isOpen ? 'open' : ''}`} ref={panelRef}>

        {/* Header */}
        <div className="profile-panel-header">
          <div className="profile-avatar-large">
            <span>{getInitials()}</span>
          </div>
          <div className="profile-header-info">
            <h2>{user?.displayName || user?.login || 'User'}</h2>
            <p>{user?.login}</p>
          </div>
          <button className="profile-close-btn" onClick={handleClose}>✕</button>
        </div>

        {/* Message bar */}
        {message && (
          <div className={`profile-message ${isError ? 'error' : 'success'}`}>
            {message}
          </div>
        )}

        {/* ── MAIN PROFILE VIEW ── */}
        {view === 'profile' && (
          <div className="profile-panel-body">
            <div className="profile-section">
              <span className="profile-label">Display Name</span>
              <div className="profile-field-row">
                <span className="profile-value">{user?.displayName || 'Not set'}</span>
                <button
                  className="profile-edit-btn"
                  onClick={() => { setView('editDisplay'); setMessage(''); setDisplayName(user?.displayName || ''); }}
                >
                  Edit
                </button>
              </div>
            </div>

            <div className="profile-section">
              <span className="profile-label">Email</span>
              <div className="profile-field-row">
                <span className="profile-value">{user?.email}</span>
                <button
                  className="profile-edit-btn"
                  onClick={() => { setView('editEmail'); setMessage(''); }}
                >
                  Edit
                </button>
              </div>
            </div>

            <div className="profile-section">
              <span className="profile-label">Username</span>
              <div className="profile-field-row">
                <span className="profile-value">{user?.login}</span>
              </div>
            </div>

            <div className="profile-section">
              <span className="profile-label">Member Since</span>
              <div className="profile-field-row">
                <span className="profile-value">{formatDate(user?.createdAt || '')}</span>
              </div>
            </div>

            <div className="profile-section">
              <span className="profile-label">Password</span>
              <div className="profile-field-row">
                <span className="profile-value">••••••••</span>
                <button
                  className="profile-edit-btn"
                  onClick={doResetPassword}
                  disabled={loading}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── EDIT DISPLAY NAME ── */}
        {view === 'editDisplay' && (
          <div className="profile-panel-body">
            <button className="profile-back-btn" onClick={() => { setView('profile'); setMessage(''); }}>
              ← Back
            </button>
            <h3 className="profile-edit-title">Edit Display Name</h3>
            <p className="profile-edit-info">This is the name other users will see.</p>
            <input
              type="text"
              className="profile-input"
              placeholder="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <button
              className="profile-save-btn"
              onClick={doUpdateDisplayName}
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}

        {/* ── EDIT EMAIL ── */}
        {view === 'editEmail' && (
          <div className="profile-panel-body">
            <button className="profile-back-btn" onClick={() => { setView('profile'); setMessage(''); }}>
              ← Back
            </button>
            <h3 className="profile-edit-title">Update Email</h3>
            <p className="profile-edit-info">
              You will need to verify your new email address before you can log in again.
            </p>
            <input
              type="email"
              className="profile-input"
              placeholder="New Email Address"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
            <button
              className="profile-save-btn"
              onClick={doUpdateEmail}
              disabled={loading}
            >
              {loading ? 'Updating...' : 'Update Email'}
            </button>
          </div>
        )}

        {/* ── PASSWORD RESET SENT ── */}
        {view === 'forgotSent' && (
  <div className="profile-panel-body">
    <button className="profile-back-btn" onClick={() => { setView('profile'); setResetStep('idle'); setMessage(''); }}>
      ← Back
    </button>

    {/* STEP 1 — Enter code */}
    {resetStep === 'code' && (
      <>
        <div className="profile-info-box">
          <span className="profile-info-icon">✉</span>
          <p>We sent a 6-digit reset code to <strong>{user?.email}</strong>. Enter it below.</p>
        </div>
        <input
          type="text"
          className="profile-input"
          placeholder="Enter 6-digit code"
          maxLength={6}
          value={resetCode}
          onChange={(e) => setResetCode(e.target.value)}
        />
        <button
          className="profile-save-btn"
          onClick={doSubmitResetCode}
          disabled={loading}
        >
          Verify Code
        </button>
      </>
    )}

    {/* STEP 2 — Enter new password */}
    {resetStep === 'newpass' && (
      <>
        <h3 className="profile-edit-title">Set New Password</h3>
        <input
          type="password"
          className="profile-input"
          placeholder="New Password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <input
          type="password"
          className="profile-input"
          placeholder="Confirm New Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <button
          className="profile-save-btn"
          onClick={doSubmitNewPassword}
          disabled={loading}
        >
          {loading ? 'Saving...' : 'Reset Password'}
        </button>
      </>
    )}
  </div>
)}

      </div>
    </>
  );
}

export default ProfilePanel;
