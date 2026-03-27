import { Outlet, Link } from 'react-router-dom';
import Logo from './Logo';
import { useAuth } from '@/contexts/AuthContext';

export default function Layout() {
  const { user, loading, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-md dark:border-gray-800 dark:bg-gray-950/80">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2">
            <Logo size={32} />
            <span className="text-sm font-bold tracking-tight text-gray-900 dark:text-white">rou39</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link
              to="/apps"
              className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
              Apps
            </Link>
            {!loading && (
              user ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 dark:text-gray-500">{user.email}</span>
                  <button
                    onClick={signOut}
                    className="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-200"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <Link
                  to="/auth"
                  className="rounded-full bg-gray-900 px-4 py-1.5 text-xs font-medium text-white transition-transform hover:scale-105 dark:bg-white dark:text-black"
                >
                  Login
                </Link>
              )
            )}
          </div>
        </nav>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-800">
        <div className="mx-auto max-w-6xl px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          &copy; {new Date().getFullYear()} rou39. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
