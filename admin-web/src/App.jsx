import { Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AuthProvider, useAuth } from './hooks/useAuth';
import AdminLayout from './layouts/AdminLayout';
import LoginPage from './pages/LoginPage';
import UsersPage from './pages/UsersPage';
import UserDetailPage from './pages/UserDetailPage';
import DevicesPage from './pages/DevicesPage';
import SettingsPage from './pages/SettingsPage';
import InviteCodesPage from './pages/InviteCodesPage';
import InviteCodeDetailPage from './pages/InviteCodeDetailPage';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return null;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AppRoutes() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return null;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? <Navigate to="/users" replace /> : <LoginPage />
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/users" replace />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:id" element={<UserDetailPage />} />
        <Route path="devices" element={<DevicesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="invite-codes" element={<InviteCodesPage />} />
        <Route path="invite-codes/:id" element={<InviteCodeDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/users" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ConfigProvider>
  );
}
