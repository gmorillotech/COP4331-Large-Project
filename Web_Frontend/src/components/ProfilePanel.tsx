import { useState, useEffect, useRef } from 'react';
import { apiUrl } from '../config';
import { maskEmail } from '../utils/emailMask';
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

// ── Validation helper ───────────────────────────────────
function validatePassword(pw: string): string[] {
  const errors: string[] = [];
  if (pw.length < 8) errors.push('At least 8 characters');
  if (!/[a-zA-Z]/.test(pw)) errors.push('At least one letter');
  if (!/[0-9]/.test(pw)) errors.push('At least one number');
  if (!/[^a-zA-Z0-9]/.test(pw)) errors.push('At least one special character');
  return errors;
}

// ── Eye toggle component ────────────────────────────────
function EyeToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="eye-toggle"
      onClick={onToggle}
      aria-label={show ? 'Hide password' : 'Show password'}
      tabIndex={-1}
    >
      {show ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      )}
    </button>
  );
}

type ProfilePanelProps = {
  externalOpen?: boolean;
  onExternalClose?: () => void;
};

function ProfilePanel({ externalOpen, onExternalClose }: ProfilePanelProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);

  const controlled = externalOpen !== undefined;
  const isOpen  = controlled ? (externalOpen ?? false) : internalOpen;
  function setIsOpen(val: boolean) {
    if (!controlled) setInternalOpen(val);
    if (!val && onExternalClose) onExternalClose();
  }
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<'profile' | 'editDisplay' | 'editEmail' | 'forgotSent'>('profile');
  const [displayName, setDisplayName] = useState('');
  const [_newEmail, setNewEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const [resetStep, setResetStep] = useState<'idle' | 'code' | 'newpass'>('idle');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Validation & UI state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [activeField, setActiveField] = useState<string | null>(null);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const pwRules = [
    { label: 'At least 8 characters',        ok: (p: string) => p.length >= 8 },
    { label: 'At least one letter',           ok: (p: string) => /[a-zA-Z]/.test(p) },
    { label: 'At least one number',           ok: (p: string) => /[0-9]/.test(p) },
    { label: 'At least one special character',ok: (p: string) => /[^a-zA-Z0-9]/.test(p) },
  ];

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
    setFieldErrors({});
    setActiveField(null);
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
      showSuccess(`Enter the 6-digit code sent to ${maskEmail(user.email)}.`);
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
    setFieldErrors({});
  }

  async function doSubmitNewPassword() {
    const errors: Record<string, string> = {};

    if (!newPassword) {
      errors.newPassword = 'New password is required.';
    } else {
      const pErrs = validatePassword(newPassword);
      if (pErrs.length > 0) errors.newPassword = pErrs.join(' · ');
    }
    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your password.';
    } else if (newPassword !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      showError('Please fix the highlighted fields.');
      return;
    }

    setFieldErrors({});
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
      setTimeout(() => { setView('profile'); setResetStep('idle'); setMessage(''); setFieldErrors({}); }, 2500);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to contact the server');
    } finally {
      setLoading(false);
    }
  }


  return (
    <>
      {/* Profile Icon Button — hidden when controlled from dashboard */}
      {!controlled && (
        <button
          className="profile-icon-btn"
          onClick={() => setIsOpen(true)}
          aria-label="Open profile"
        >
          <span className="profile-initials">{getInitials()}</span>
        </button>
      )}

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
                <span className="profile-value1">{user?.displayName || 'Not set'}</span>
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
                <span className="profile-value1">••••••••</span>
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
          <div className="profile-panel-body edit-centered">
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
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}

        {/* editEmail view removed — email is read-only */}

        {/* ── CHANGE PASSWORD FLOW ── */}
        {view === 'forgotSent' && (
          <div className="profile-panel-body edit-centered">
            <button
              className="profile-back-btn"
              onClick={() => { setView('profile'); setMessage(''); setResetStep('idle'); setFieldErrors({}); }}
            >
              ← Back
            </button>

            {/* Step 1: Enter code */}
            {resetStep === 'code' && (
              <>
                <h3 className="profile-edit-title">Enter Reset Code</h3>
                <div className="profile-info-box">
                  <span className="profile-info-icon">✉</span>
                  <p>
                    A 6-digit code was sent to{' '}
                    <strong>{maskEmail(user?.email || '')}</strong>. Enter it below.
                  </p>
                </div>
                <input
                  type="text"
                  className="profile-input"
                  placeholder="6-digit code"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  maxLength={6}
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

            {/* Step 2: Set new password */}
            {resetStep === 'newpass' && (
              <>
                <h3 className="profile-edit-title">Set New Password</h3>
                <p className="profile-edit-info">Choose a strong password for your account.</p>

                {/* New password */}
                <div className="field-wrap">
                  <div className="password-input-wrap">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      className={`profile-input${fieldErrors.newPassword ? ' input-error' : ''}`}
                      placeholder="New Password"
                      value={newPassword}
                      onChange={(e) => { setNewPassword(e.target.value); setFieldErrors(p => ({ ...p, newPassword: '' })); }}
                      onFocus={() => setActiveField('newPassword')}
                      onBlur={() => setActiveField(null)}
                    />
                    <EyeToggle show={showNewPassword} onToggle={() => setShowNewPassword(p => !p)} />
                  </div>
                  {fieldErrors.newPassword && (
                    <p className="field-error-msg">{fieldErrors.newPassword}</p>
                  )}
                  {activeField === 'newPassword' && (
                    <ul className="field-rules">
                      {pwRules.map(r => (
                        <li key={r.label} className={r.ok(newPassword) ? 'rule-ok' : 'rule-pending'}>
                          {r.ok(newPassword) ? '✓' : '·'} {r.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Confirm password */}
                <div className="field-wrap">
                  <div className="password-input-wrap">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      className={`profile-input${fieldErrors.confirmPassword ? ' input-error' : ''}`}
                      placeholder="Confirm Password"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors(p => ({ ...p, confirmPassword: '' })); }}
                    />
                    <EyeToggle show={showConfirmPassword} onToggle={() => setShowConfirmPassword(p => !p)} />
                  </div>
                  {fieldErrors.confirmPassword && (
                    <p className="field-error-msg">{fieldErrors.confirmPassword}</p>
                  )}
                </div>

                <button
                  className="profile-save-btn"
                  onClick={doSubmitNewPassword}
                  disabled={loading}
                >
                  {loading ? 'Resetting…' : 'Reset Password'}
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
