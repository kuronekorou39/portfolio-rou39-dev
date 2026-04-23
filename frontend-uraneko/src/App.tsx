import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AgeGateProvider } from './contexts/AgeGateContext';
import AgeGateModal from './components/AgeGateModal';
import Layout from './components/Layout';

const HomePage = lazy(() => import('./pages/HomePage'));
const ProductPage = lazy(() => import('./pages/ProductPage'));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage'));
const OrderCompletePage = lazy(() => import('./pages/OrderCompletePage'));
const MyOrdersPage = lazy(() => import('./pages/MyOrdersPage'));
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-white/50" />
    </div>
  );
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
