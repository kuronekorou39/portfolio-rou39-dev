import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

// /auth に直接アクセスした場合はトップページにリダイレクト
// ログインはモーダルで行うため、専用ページは不要
export default function AuthPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060608]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/apps" replace />;
  }

  return <Navigate to="/" replace />;
}
