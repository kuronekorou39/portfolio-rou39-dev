import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import Layout from '@/components/Layout';
import HomePage from '@/pages/HomePage';
import HomePageV1 from '@/pages/HomePageV1';
import HomePageV2 from '@/pages/HomePageV2';
import LogoShowcase from '@/pages/LogoShowcase';
import AppsPage from '@/pages/AppsPage';
import AppDetailPage from '@/pages/AppDetailPage';
import AuthPage from '@/pages/AuthPage';
import AuthCallbackPage from '@/pages/AuthCallbackPage';
import ProfilePage from '@/pages/ProfilePage';
import NotFoundPage from '@/pages/NotFoundPage';

function App() {
  return (
    <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/v1" element={<HomePageV1 />} />
          <Route path="/v2" element={<HomePageV2 />} />
          <Route path="/logos" element={<LogoShowcase />} />
          <Route path="/apps" element={<AppsPage />} />
          <Route path="/apps/:id" element={<AppDetailPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
