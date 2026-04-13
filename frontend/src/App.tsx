import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import Layout from '@/components/Layout';
import HomePage from '@/pages/HomePage';
import AppsPage from '@/pages/AppsPage';
import AppDetailPage from '@/pages/AppDetailPage';
import AuthPage from '@/pages/AuthPage';
import AuthCallbackPage from '@/pages/AuthCallbackPage';
import ProfilePage from '@/pages/ProfilePage';
import NotFoundPage from '@/pages/NotFoundPage';
import AprilFoolsPage from '@/pages/AprilFoolsPage';
import AdminLoginPage from '@/pages/AdminLoginPage';
import AdminDashboardPage from '@/pages/AdminDashboardPage';
import Game2048Page from '@/pages/Game2048Page';

function App() {
  return (
    <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/april-fools" element={<AprilFoolsPage />} />
        <Route path="/admin" element={<AdminLoginPage />} />
        <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/apps" element={<AppsPage />} />
          <Route path="/apps/:id" element={<AppDetailPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/games/2048" element={<Game2048Page />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
