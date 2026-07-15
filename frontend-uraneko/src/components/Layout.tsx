import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AuthModal from './AuthModal';

const NAV_ITEMS: { to: string; label: string }[] = [
  { to: '/', label: 'INDEX' },
  { to: '/my/orders', label: 'LIBRARY' },
];

export default function Layout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        color: 'var(--color-fg)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* ヘッダー */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          flexWrap: 'wrap',
          rowGap: 14,
          alignItems: 'center',
          padding: '18px clamp(16px, 4vw, 60px)',
          borderBottom: '1px solid rgba(168,166,158,0.22)',
          background:
            'linear-gradient(180deg, var(--color-deep), var(--color-bg))',
        }}
      >
        {/* 下端の真鍮ライン */}
        <div
          className="brass-hairline"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
        />

        {/* ロゴ */}
        <Link
          to="/"
          style={{
            display: 'flex',
            flexDirection: 'column',
            textDecoration: 'none',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-serif-jp)',
              fontSize: 22,
              fontWeight: 300,
              letterSpacing: 10,
              color: 'var(--color-fg)',
            }}
          >
            uraneko
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: 4,
              color: 'var(--color-gold)',
              marginTop: 2,
            }}
          >
            private archive — 18+
          </span>
        </Link>

        {/* ナビ */}
        <nav
          style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            gap: 'clamp(20px, 5vw, 44px)',
            minWidth: 160,
            fontFamily: 'var(--font-sans)',
            fontSize: 11,
            letterSpacing: 4,
          }}
        >
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              style={({ isActive }) => ({
                position: 'relative',
                paddingBottom: 4,
                color: isActive ? 'var(--color-fg)' : 'var(--muted)',
                textDecoration: 'none',
              })}
            >
              {({ isActive }) => (
                <>
                  {item.label}
                  {isActive && (
                    <span
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: -2,
                        height: 1,
                        background: 'var(--color-gold)',
                      }}
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* 右側 */}
        <div
          style={{
            display: 'flex',
            gap: 22,
            alignItems: 'center',
            fontFamily: 'var(--font-sans)',
            fontSize: 11,
            letterSpacing: 3,
            color: 'var(--muted)',
          }}
        >
          {user ? (
            <>
              <span
                style={{
                  padding: '6px 14px',
                  border: '1px solid rgba(168,166,158,0.6)',
                  fontSize: 10,
                  letterSpacing: 3,
                  color: 'var(--color-gold)',
                  fontFamily: 'var(--font-mono)',
                }}
                title={user.email}
              >
                M {user.userId.slice(-4).toUpperCase()}
              </span>
              <button
                onClick={signOut}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: 11,
                  letterSpacing: 3,
                }}
              >
                SIGN OUT
              </button>
            </>
          ) : (
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setAuthOpen(true);
              }}
              style={{
                color: 'var(--color-gold)',
                textDecoration: 'none',
                letterSpacing: 4,
              }}
            >
              SIGN IN
            </a>
          )}
        </div>
      </header>

      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        googleReturnTo={location.pathname}
      />

      {/* 本文 */}
      <main
        key={location.pathname}
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: 'clamp(28px, 6vw, 56px) clamp(16px, 4vw, 60px)',
        }}
      >
        <Outlet />
      </main>

      {/* フッター */}
      <footer
        style={{
          borderTop: '1px solid rgba(168,166,158,0.18)',
          padding: '24px clamp(16px, 4vw, 60px)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: 3,
          color: 'var(--dim)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          justifyContent: 'space-between',
        }}
      >
        <span>uraneko — private archive</span>
        <span style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Link to="/guide" style={{ color: 'var(--color-gold)', textDecoration: 'none' }}>
            送金ガイド
          </Link>
          <Link to="/legal/tokushoho" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
            特定商取引法
          </Link>
          <Link to="/legal/privacy" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
            プライバシー
          </Link>
          <Link to="/legal/terms" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
            利用規約
          </Link>
        </span>
        <span style={{ color: 'var(--color-accent)' }}>18+ · rou39.com</span>
      </footer>
    </div>
  );
}
