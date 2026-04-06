import { Outlet } from 'react-router-dom';
import AdminNav from '../../components/admin/AdminNav.tsx';
import '../../components/admin/AdminLayout.css';

function AdminLayout() {
  return (
    <div className="admin-shell">
      <AdminNav />
      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;
