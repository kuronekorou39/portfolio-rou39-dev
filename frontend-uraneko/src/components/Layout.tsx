import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getGoogleLoginUrl } from '../lib/auth';

export default function Layout() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-neutral-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-bold tracking-tight">
            uraneko
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            {user ? (
              <>
                <Link to="/my/orders" className="text-neutral-300 hover:text-white">
                  購入履歴
                </Link>
                <span className="text-xs text-neutral-500">{user.email}</span>
                <button onClick={signOut} className="text-neutral-400 hover:text-white">
                  ログアウト
                </button>
              </>
            ) : (
              <a
                href={getGoogleLoginUrl()}
                className="text-neutral-300 hover:text-white"
              >
                ログイン
              </a>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-white/10 py-6 text-center text-xs text-neutral-500">
        uraneko.rou39.com ・ 18 歳未満の方はご利用いただけません
      </footer>
    </div>
  );
}
