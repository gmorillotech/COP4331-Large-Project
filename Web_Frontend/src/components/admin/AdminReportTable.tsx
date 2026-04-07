import { useState, useEffect, useCallback } from 'react';
import { apiUrl } from '../../config';

type Report = {
  reportId: string;
  studyLocationId: string;
  locationName: string;
  userId: string;
  reporterDisplayName: string;
  createdAt: string;
  avgNoise: number;
  maxNoise: number;
  variance: number;
  occupancy: number;
};

type ReportsResponse = {
  reports: Report[];
  total: number;
  page: number;
  limit: number;
  error?: string;
};

type AdminReportTableProps = {
  groupId?: string;
  locationId?: string;
  searchQuery?: string;
  refreshKey?: number;
};

const PAGE_SIZE = 50;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function AdminReportTable({ groupId, locationId, searchQuery, refreshKey }: AdminReportTableProps) {
  const [reports, setReports] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchReports = useCallback(async (pg: number) => {
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (groupId) params.set('groupId', groupId);
    if (locationId) params.set('locationId', locationId);
    if (searchQuery) params.set('q', searchQuery);
    params.set('page', String(pg));
    params.set('limit', String(PAGE_SIZE));

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/admin/reports/active?${params.toString()}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: ReportsResponse = await res.json();

      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to load reports');
        setReports([]);
        setTotal(0);
        return;
      }

      setReports(data.reports);
      setTotal(data.total);
      setPage(data.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the server');
      setReports([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [groupId, locationId, searchQuery]);

  useEffect(() => {
    setPage(1);
    void fetchReports(1);
  }, [fetchReports, refreshKey]);

  async function handleDelete(reportId: string) {
    setIsDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/admin/reports/${reportId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Delete failed' }));
        setError(data.error ?? 'Delete failed');
        return;
      }

      setConfirmingId(null);
      void fetchReports(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the server');
    } finally {
      setIsDeleting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function goToPage(pg: number) {
    setPage(pg);
    void fetchReports(pg);
  }

  if (isLoading) {
    return <div className="admin-report-table__loading">Loading reports...</div>;
  }

  if (error) {
    return <div className="admin-report-table__loading" style={{ color: '#dc2626' }}>{error}</div>;
  }

  if (reports.length === 0) {
    return <div className="admin-report-table__empty">No active reports</div>;
  }

  return (
    <>
      <div className="admin-report-table-wrapper">
        <table className="admin-report-table">
          <thead>
            <tr>
              <th>Report ID</th>
              <th>Location ID</th>
              <th>Location Name</th>
              <th>User ID</th>
              <th>Reporter</th>
              <th>Created</th>
              <th>Avg Noise</th>
              <th>Max Noise</th>
              <th>Variance</th>
              <th>Occupancy</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.reportId}>
                <td title={r.reportId}>{r.reportId.slice(0, 8)}...</td>
                <td title={r.studyLocationId}>{r.studyLocationId.slice(0, 8)}...</td>
                <td>{r.locationName}</td>
                <td title={r.userId}>{r.userId.slice(0, 8)}...</td>
                <td>{r.reporterDisplayName}</td>
                <td>{formatDate(r.createdAt)}</td>
                <td>{r.avgNoise.toFixed(1)}</td>
                <td>{r.maxNoise.toFixed(1)}</td>
                <td>{r.variance.toFixed(2)}</td>
                <td>{r.occupancy}</td>
                <td>
                  <button
                    type="button"
                    className="admin-delete-btn"
                    onClick={() => setConfirmingId(r.reportId)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="admin-report-pagination">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
          >
            Previous
          </button>
          <span className="admin-report-pagination__info">
            Page {page} of {totalPages} ({total} total)
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => goToPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}

      {/* Delete confirmation overlay */}
      {confirmingId !== null && (
        <div className="admin-confirm-overlay" onClick={() => setConfirmingId(null)}>
          <div className="admin-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Confirm Delete</h3>
            <p>
              Are you sure you want to delete report {confirmingId}? This action cannot be undone.
            </p>
            <div className="admin-confirm-dialog__actions">
              <button
                type="button"
                className="admin-confirm-dialog__cancel"
                onClick={() => setConfirmingId(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-confirm-dialog__confirm"
                onClick={() => handleDelete(confirmingId)}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default AdminReportTable;
