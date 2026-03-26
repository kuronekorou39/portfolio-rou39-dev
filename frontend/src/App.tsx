import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from '@/components/Layout';
import HomePage from '@/pages/HomePage';
import HomePageV1 from '@/pages/HomePageV1';
import HomePageV2 from '@/pages/HomePageV2';
import LogoShowcase from '@/pages/LogoShowcase';
import AppsPage from '@/pages/AppsPage';
import AppDetailPage from '@/pages/AppDetailPage';
import NotFoundPage from '@/pages/NotFoundPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/v1" element={<HomePageV1 />} />
          <Route path="/v2" element={<HomePageV2 />} />
          <Route path="/logos" element={<LogoShowcase />} />
          <Route path="/apps" element={<AppsPage />} />
          <Route path="/apps/:id" element={<AppDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
