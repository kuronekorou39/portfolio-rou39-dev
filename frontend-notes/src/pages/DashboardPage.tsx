import { useAuth } from '../contexts/AuthContext';
import { beginGoogleLogin } from '../lib/auth';

/**
 * 管理画面(メモURL ダッシュボード)。
 * P1 時点はログインゲートと骨格のみ。一覧/発行/再発行/失効は P2 で実装する。
 */
export default function DashboardPage() {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '96px 24px', color: 'var(--muted)' }}>
        読み込み中…
      </div>
    );
  }

  if (!user) {
    return (
      <main style={{ maxWidth: 480, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>Stash Notes</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 32 }}>
          管理画面はログインが必要です。メモの閲覧・編集は発行済みの秘密URLから直接どうぞ。
        </p>
        <button
          onClick={() => void beginGoogleLogin()}
          style={{
            padding: '10px 24px',
            fontSize: 15,
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: '#fff',
          }}
        >
          Google でログイン
        </button>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          borderBottom: '1px solid var(--border)',
          paddingBottom: 12,
          marginBottom: 24,
        }}
      >
        <h1 style={{ fontSize: 22, margin: 0 }}>Stash Notes</h1>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          {user.email}{' '}
          <button
            onClick={signOut}
            style={{
              marginLeft: 12,
              padding: '4px 10px',
              fontSize: 12,
              border: '1px solid var(--border)',
              borderRadius: 4,
              background: 'transparent',
            }}
          >
            ログアウト
          </button>
        </div>
      </header>
      <p style={{ color: 'var(--muted)' }}>
        メモURL の一覧・発行はこれから実装します(P2)。
      </p>
    </main>
  );
}
