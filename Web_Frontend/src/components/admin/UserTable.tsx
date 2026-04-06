import type { ChangeEvent } from 'react';
import { useState, useMemo, useCallback, useEffect } from 'react';
import EditUserDialog from './EditUserDialog';
import type { AdminUser } from './EditUserDialog';

type UserTableProps = {
  users: AdminUser[];
  onUserUpdated: () => void;
};

type SortKey =
  | 'displayName'
  | 'email'
  | 'userId'
  | 'userOccupancyWF'
  | 'role'
  | 'accountStatus'
  | 'emailVerifiedAt'
  | 'createdAt';

type SortDir = 'asc' | 'desc';

function getDisplayName(u: AdminUser): string {
  return u.displayName
    || (u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : '')
    || u.login;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function UserTable({ users, onUserUpdated }: UserTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [confirmReset, setConfirmReset] = useState<AdminUser | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const [deleteEmailInput, setDeleteEmailInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const sortedUsers = useMemo(() => {
    const sorted = [...users].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortKey) {
        case 'displayName':
          aVal = getDisplayName(a).toLowerCase();
          bVal = getDisplayName(b).toLowerCase();
          break;
        case 'email':
          aVal = a.email.toLowerCase();
          bVal = b.email.toLowerCase();
          break;
        case 'userId':
          aVal = a.userId;
          bVal = b.userId;
          break;
        case 'userOccupancyWF':
          aVal = a.userOccupancyWF;
          bVal = b.userOccupancyWF;
          break;
        case 'role':
          aVal = a.role || 'user';
          bVal = b.role || 'user';
          break;
        case 'accountStatus':
          aVal = a.accountStatus || 'active';
          bVal = b.accountStatus || 'active';
          break;
        case 'emailVerifiedAt':
          aVal = a.emailVerifiedAt || '';
          bVal = b.emailVerifiedAt || '';
          break;
        case 'createdAt':
          aVal = a.createdAt || '';
          bVal = b.createdAt || '';
          break;
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [users, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function getSortIndicator(key: SortKey): string {
    if (sortKey !== key) return ' \u2195';
    return sortDir === 'asc' ? ' \u2191' : ' \u2193';
  }

  async function copyUserId(userId: string) {
    try {
      await navigator.clipboard.writeText(userId);
      setCopiedId(userId);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Fallback — silent fail
    }
  }

  const handleEditSave = useCallback(async (userId: string, changes: Record<string, unknown>) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(changes),
    });

    if (!response.ok) {
      const res = await response.json();
      if (response.status === 409) {
        throw new Error(res.error || 'Email is already in use.');
      }
      throw new Error(res.error || 'Failed to update user.');
    }

    onUserUpdated();
  }, [onUserUpdated]);

  async function handleForcePasswordReset(user: AdminUser) {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/users/${user.userId}/force-password-reset`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const res = await response.json();

      if (!response.ok) {
        setActionMessage({ text: res.error || 'Failed to force password reset.', type: 'error' });
        return;
      }

      setActionMessage({ text: res.message || 'Password reset forced successfully.', type: 'success' });
      setConfirmReset(null);
      onUserUpdated();
    } catch (err) {
      setActionMessage({ text: err instanceof Error ? err.message : 'Unable to contact server.', type: 'error' });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteUser(user: AdminUser) {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/users/${user.userId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const res = await response.json();

      if (!response.ok) {
        setActionMessage({ text: res.error || 'Failed to delete user.', type: 'error' });
        return;
      }

      setActionMessage({ text: res.message || 'User deleted successfully.', type: 'success' });
      setConfirmDelete(null);
      setDeleteEmailInput('');
      onUserUpdated();
    } catch (err) {
      setActionMessage({ text: err instanceof Error ? err.message : 'Unable to contact server.', type: 'error' });
    } finally {
      setActionLoading(false);
    }
  }

  // Auto-dismiss success messages after 4 seconds
  useEffect(() => {
    if (actionMessage?.type === 'success') {
      const timer = setTimeout(() => setActionMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [actionMessage]);

  return (
    <>
      {actionMessage && (
        <div className={`modal-message ${actionMessage.type}`}>
          {actionMessage.text}
        </div>
      )}

      <div className="user-table-wrapper">
        <table className="user-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('displayName')}>
                Display Name
                <span className={`sort-indicator${sortKey === 'displayName' ? ' active' : ''}`}>
                  {getSortIndicator('displayName')}
                </span>
              </th>
              <th onClick={() => handleSort('email')}>
                Email
                <span className={`sort-indicator${sortKey === 'email' ? ' active' : ''}`}>
                  {getSortIndicator('email')}
                </span>
              </th>
              <th onClick={() => handleSort('userId')}>
                User ID
                <span className={`sort-indicator${sortKey === 'userId' ? ' active' : ''}`}>
                  {getSortIndicator('userId')}
                </span>
              </th>
              <th onClick={() => handleSort('userOccupancyWF')}>
                Trust Score
                <span className={`sort-indicator${sortKey === 'userOccupancyWF' ? ' active' : ''}`}>
                  {getSortIndicator('userOccupancyWF')}
                </span>
              </th>
              <th onClick={() => handleSort('role')}>
                Role
                <span className={`sort-indicator${sortKey === 'role' ? ' active' : ''}`}>
                  {getSortIndicator('role')}
                </span>
              </th>
              <th onClick={() => handleSort('accountStatus')}>
                Status
                <span className={`sort-indicator${sortKey === 'accountStatus' ? ' active' : ''}`}>
                  {getSortIndicator('accountStatus')}
                </span>
              </th>
              <th onClick={() => handleSort('emailVerifiedAt')}>
                Email Verified
                <span className={`sort-indicator${sortKey === 'emailVerifiedAt' ? ' active' : ''}`}>
                  {getSortIndicator('emailVerifiedAt')}
                </span>
              </th>
              <th onClick={() => handleSort('createdAt')}>
                Created At
                <span className={`sort-indicator${sortKey === 'createdAt' ? ' active' : ''}`}>
                  {getSortIndicator('createdAt')}
                </span>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((user) => (
              <tr key={user.userId}>
                <td>{getDisplayName(user)}</td>
                <td>{user.email}</td>
                <td>
                  <span
                    className={`user-id-cell${copiedId === user.userId ? ' copied' : ''}`}
                    title={`Click to copy: ${user.userId}`}
                    onClick={() => copyUserId(user.userId)}
                  >
                    {copiedId === user.userId
                      ? 'Copied!'
                      : user.userId.length > 8
                        ? user.userId.slice(0, 8) + '...'
                        : user.userId}
                  </span>
                </td>
                <td>{user.userOccupancyWF}</td>
                <td>
                  <span className={`role-badge ${user.role || 'user'}`}>
                    {user.role || 'user'}
                  </span>
                </td>
                <td>
                  <span className={`status-badge ${user.accountStatus || 'active'}`}>
                    {(user.accountStatus || 'active').replace('_', ' ')}
                  </span>
                </td>
                <td>
                  {user.emailVerifiedAt ? (
                    <span className="verified-yes">{formatDate(user.emailVerifiedAt)}</span>
                  ) : (
                    <span className="verified-no">Not verified</span>
                  )}
                </td>
                <td>{formatDate(user.createdAt)}</td>
                <td>
                  <div className="user-actions">
                    <button
                      className="action-btn edit"
                      onClick={() => setEditingUser(user)}
                    >
                      Edit
                    </button>
                    <button
                      className="action-btn reset-pw"
                      onClick={() => {
                        setConfirmReset(user);
                        setActionMessage(null);
                      }}
                    >
                      Reset Password
                    </button>
                    <button
                      className="action-btn delete"
                      onClick={() => {
                        setConfirmDelete(user);
                        setDeleteEmailInput('');
                        setActionMessage(null);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit User Dialog */}
      {editingUser && (
        <EditUserDialog
          user={editingUser}
          onSave={handleEditSave}
          onClose={() => setEditingUser(null)}
        />
      )}

      {/* Force Password Reset Confirmation */}
      {confirmReset && (
        <div className="modal-overlay" onClick={() => setConfirmReset(null)}>
          <div className="modal-dialog confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Force Password Reset</h2>
              <button className="modal-close-btn" onClick={() => setConfirmReset(null)}>
                ✕
              </button>
            </div>
            <div className="confirm-body">
              {actionMessage && (
                <div className={`modal-message ${actionMessage.type}`}>
                  {actionMessage.text}
                </div>
              )}
              <p>
                Force password reset for <strong>{getDisplayName(confirmReset)}</strong>?
                This will invalidate their active sessions, require email re-verification,
                and force a new password.
              </p>
            </div>
            <div className="confirm-footer">
              <button
                className="modal-btn cancel"
                onClick={() => setConfirmReset(null)}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                className="modal-btn danger"
                onClick={() => handleForcePasswordReset(confirmReset)}
                disabled={actionLoading}
              >
                {actionLoading ? 'Resetting...' : 'Force Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Confirmation */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => { setConfirmDelete(null); setDeleteEmailInput(''); }}>
          <div className="modal-dialog confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete User</h2>
              <button
                className="modal-close-btn"
                onClick={() => { setConfirmDelete(null); setDeleteEmailInput(''); }}
              >
                ✕
              </button>
            </div>
            <div className="confirm-body">
              {actionMessage && (
                <div className={`modal-message ${actionMessage.type}`}>
                  {actionMessage.text}
                </div>
              )}
              <p>
                Delete user <strong>{getDisplayName(confirmDelete)}</strong> ({confirmDelete.email})?
              </p>
              <p className="warning-text">
                This action is PERMANENT and cannot be undone.
              </p>
              <p>Type the user's email to confirm:</p>
              <input
                type="text"
                className="confirm-email-input"
                placeholder={confirmDelete.email}
                value={deleteEmailInput}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setDeleteEmailInput(e.target.value)}
              />
            </div>
            <div className="confirm-footer">
              <button
                className="modal-btn cancel"
                onClick={() => { setConfirmDelete(null); setDeleteEmailInput(''); }}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                className="modal-btn danger"
                onClick={() => handleDeleteUser(confirmDelete)}
                disabled={actionLoading || deleteEmailInput !== confirmDelete.email}
              >
                {actionLoading ? 'Deleting...' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default UserTable;
