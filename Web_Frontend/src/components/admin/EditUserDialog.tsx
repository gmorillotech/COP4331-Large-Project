import type { ChangeEvent } from 'react';
import { useState } from 'react';
import TrustScoreControl from './TrustScoreControl';

type AdminUser = {
  userId: string;
  login: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  userNoiseWF: number;
  userOccupancyWF: number;
  trustScore: number;
  role: string;
  accountStatus: string;
  emailVerifiedAt: string | null;
  createdAt: string;
};

type EditUserDialogProps = {
  user: AdminUser;
  onSave: (userId: string, changes: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
};

function EditUserDialog({ user, onSave, onClose }: EditUserDialogProps) {
  const [email, setEmail] = useState(user.email);
  const [trustScore, setTrustScore] = useState(user.trustScore ?? user.userOccupancyWF ?? 1);
  const [role, setRole] = useState(user.role || 'user');
  const [accountStatus, setAccountStatus] = useState(user.accountStatus || 'active');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  async function handleSave() {
    // Build changed fields only
    const changes: Record<string, unknown> = {};
    if (email !== user.email) changes.email = email;
    const originalTrust = user.trustScore ?? user.userOccupancyWF ?? 1;
    if (trustScore !== originalTrust) changes.userOccupancyWF = trustScore;
    if (role !== (user.role || 'user')) changes.role = role;
    if (accountStatus !== (user.accountStatus || 'active')) changes.accountStatus = accountStatus;

    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      await onSave(user.userId, changes);
      onClose();
    } catch (err) {
      setIsError(true);
      setMessage(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  const displayName = user.displayName
    || (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : '')
    || user.login;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit User: {displayName}</h2>
          <button className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {message && (
            <div className={`modal-message ${isError ? 'error' : 'success'}`}>
              {message}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Trust Score</label>
            <TrustScoreControl value={trustScore} onChange={setTrustScore} />
          </div>

          <div className="form-group">
            <label className="form-label">Role</label>
            <select
              className="form-select"
              value={role}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setRole(e.target.value)}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Account Status</label>
            <select
              className="form-select"
              value={accountStatus}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setAccountStatus(e.target.value)}
            >
              <option value="active">Active</option>
              <option value="forced_reset">Forced Reset</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Noise Weight Factor (read-only)</label>
            <div className="form-readonly">{user.userNoiseWF}</div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="modal-btn cancel"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="modal-btn primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default EditUserDialog;
export type { AdminUser };
