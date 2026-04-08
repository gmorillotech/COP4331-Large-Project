import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import HomePage from './pages/HomePage.tsx';
import LoginPage from './pages/LoginPage.tsx';
import VerifyEmail from './VerifyEmail';
import ResetPassword from './ResetPassword';
import AdminGuard from './components/admin/AdminGuard.tsx';
import AdminLayout from './pages/admin/AdminLayout.tsx';
import AdminSearchPage from './pages/admin/AdminSearchPage.tsx';
import ManageUsersPage from './pages/admin/ManageUsersPage.tsx';
import LocationEditPage from './pages/admin/LocationEditPage.tsx';
import RedrawGroupPage from './pages/admin/RedrawGroupPage.tsx';
import DataCollectionPage from './pages/DataCollectionPage.tsx';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/verify" element={<VerifyEmail />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/collect" element={<DataCollectionPage />} />


        {/* Admin routes */}
        <Route path="/admin" element={<AdminGuard />}>
          <Route element={<AdminLayout />}>
            <Route index element={<AdminSearchPage />} />
            <Route path="users" element={<ManageUsersPage />} />
            <Route path="redraw/:groupId" element={<RedrawGroupPage />} />
            <Route path="locations" element={<LocationEditPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;