import { useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import Logo from './Logo';
import AuthModal from './AuthModal';
import { useAuth } from '@/contexts/AuthContext';
import { getAvatarEmoji } from '@/lib/avatars';

export default function Layout() {
  const { user, loading, signOut } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  return (
    <div className="min-h-screen bg-[#060608] text-gray-100">
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#060608]/80 backdrop-blur-md">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2">
            <Logo size={32} />
            <span className="text-sm font-bold tracking-tight text-white">rou39</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link
              to="/apps"
              className="text-sm font-medium text-gray-400 transition-colors hover:text-gray-100"
            >
              Apps
            </Link>
            {!loading && (
              user ? (
                <div className="flex items-center gap-3">
                  <Link to="/profile" className="flex items-center gap-1.5 text-xs text-gray-500 transition-colors hover:text-gray-300">
                    <span>{getAvatarEmoji(user.avatar)}</span>
                    <span>{user.nickname}</span>
                  </Link>
                  <button
                    onClick={signOut}
                    className="rounded-full border border-gray-700 px-3 py-1 text-xs font-medium text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAuth(true)}
                  className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black transition-transform hover:scale-105"
                >
                  Login
                </button>
              )
            )}
          </div>
        </nav>
      </header>

      <main>
        <Outlet context={{ openAuth: () => setShowAuth(true) }} />
      </main>

      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto max-w-6xl px-6 py-8 text-center text-sm text-gray-400">
          &copy; {new Date().getFullYear()} rou39. All rights reserved.
        </div>
      </footer>

      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
    </div>
  );
}
