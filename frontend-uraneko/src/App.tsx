import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AgeGateProvider } from './contexts/AgeGateContext';
import AgeGateModal from './components/AgeGateModal';
import Layout from './components/Layout';
import Loading from './components/bar/Loading';

const HomePage = lazy(() => import('./pages/HomePage'));
const ProductPage = lazy(() => import('./pages/ProductPage'));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage'));
const OrderCompletePage = lazy(() => import('./pages/OrderCompletePage'));
const MyOrdersPage = lazy(() => import('./pages/MyOrdersPage'));
const GuidePage = lazy(() => import('./pages/GuidePage'));
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const TokushohoPage = lazy(() => import('./pages/LegalPages').then((m) => ({ default: m.TokushohoPage })));
const PrivacyPage = lazy(() => import('./pages/LegalPages').then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import('./pages/LegalPages').then((m) => ({ default: m.TermsPage })));

function PageLoader() {
  return <Loading pad="120px 0" />;
}

export default function App() {
  return (
    <AgeGateProvider>
      <AuthProvider>
        <BrowserRouter>
          <AgeGateModal />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/product/:id" element={<ProductPage />} />
                <Route path="/checkout/:id" element={<CheckoutPage />} />
                <Route path="/order/:id/complete" element={<OrderCompletePage />} />
                <Route path="/my/orders" element={<MyOrdersPage />} />
                <Route path="/guide" element={<GuidePage />} />
                <Route path="/legal/tokushoho" element={<TokushohoPage />} />
                <Route path="/legal/privacy" element={<PrivacyPage />} />
                <Route path="/legal/terms" element={<TermsPage />} />
                <Route path="/auth/callback" element={<AuthCallbackPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </AgeGateProvider>
  );
}
