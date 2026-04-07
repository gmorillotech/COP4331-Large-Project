import type { ChangeEvent } from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiUrl } from '../../config';
import UserTable from '../../components/admin/UserTable';
import type { AdminUser } from '../../components/admin/EditUserDialog';
import '../../components/admin/ManageUsers.css';

function ManageUsersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUsers = useCallback(async (query: string) => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const params = query ? `?q=${encodeURIComponent(query)}` : '';
      const response = await fetch(apiUrl(`/api/admin/users${params}`), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const res = await response.json();
        throw new Error(res.error || 'Failed to fetch users.');
      }

      const data = await response.json();
      setUsers(data.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to contact server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers('');
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchUsers]);

  function handleSearchChange(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setSearchTerm(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchUsers(value);
    }, 300);
  }

  function handleRefresh() {
    fetchUsers(searchTerm);
  }

  function handleUserUpdated() {
    fetchUsers(searchTerm);
  }

  return (
    <div className="manage-users-page">
      <h1>Manage Users</h1>

      <div className="manage-users-toolbar">
        <input
          type="text"
          className="manage-users-search"
          placeholder="Search users by name, email, or ID..."
          value={searchTerm}
          onChange={handleSearchChange}
        />
        <button
          className="manage-users-refresh-btn"
          onClick={handleRefresh}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {loading && (
        <div className="manage-users-loading">Loading users...</div>
      )}

      {error && !loading && (
        <div className="manage-users-error">{error}</div>
      )}

      {!loading && !error && users.length === 0 && (
        <div className="manage-users-empty">
          {searchTerm ? 'No users match your search.' : 'No users found.'}
        </div>
      )}

      {!loading && !error && users.length > 0 && (
        <UserTable users={users} onUserUpdated={handleUserUpdated} />
      )}
    </div>
  );
}

export default ManageUsersPage;
