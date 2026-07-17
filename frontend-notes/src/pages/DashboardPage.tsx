import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { beginGoogleLogin, getIdToken } from '../lib/auth';
import { api, ApiError, type MemoSummary } from '../lib/api';

function fmtJst(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

/** 発行直後の秘密URLを1回だけ見せるモーダル(サーバはハッシュのみ保持=再表示不可)。 */
function SecretUrlModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 10,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: 24,
          maxWidth: 560,
          width: '100%',
        }}
      >
        <h2 style={{ fontSize: 17, marginTop: 0 }}>メモURL を発行しました</h2>
        <p style={{ fontSize: 13, color: 'var(--danger)', fontWeight: 600 }}>
          この URL は二度と表示できません。必ずコピーして保存してください。
        </p>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          URL を知っている人は誰でもこのメモを開けます。紛失・漏洩したときは「再発行」で旧URLを無効化できます。
        </p>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '10px 12px',
            wordBreak: 'break-all',
            marginBottom: 16,
          }}
        >
          {url}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(url).then(() => setCopied(true));
            }}
            style={{
              padding: '8px 16px',
              border: '1px solid var(--accent)',
              color: copied ? '#fff' : 'var(--accent)',
              background: copied ? 'var(--accent)' : '#fff',
              borderRadius: 6,
            }}
          >
            {copied ? 'コピーしました' : 'URL をコピー'}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              border: '1px solid var(--border)',
              background: '#fff',
              borderRadius: 6,
            }}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth();
  const [memos, setMemos] = useState<MemoSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issuedUrl, setIssuedUrl] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const idToken = await getIdToken();
    if (!idToken) return;
    try {
      setMemos(await api.listMemos(idToken));
      setListError(null);
    } catch {
      setListError('一覧の取得に失敗しました。再読み込みしてください。');
    }
  }, []);

  useEffect(() => {
    if (user) void reload();
  }, [user, reload]);

  const issue = useCallback(async () => {
    setIssuing(true);
    setIssueError(null);
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('login');
      const result = await api.issueMemo(idToken, title.trim());
      setIssuedUrl(result.url);
      setTitle('');
      void reload();
    } catch (e) {
      setIssueError(
        e instanceof ApiError && e.code === 'memo_limit_reached'
          ? 'メモ数が上限に達しています。不要なメモを削除してください。'
          : '発行に失敗しました。時間をおいて再試行してください。',
      );
    } finally {
      setIssuing(false);
    }
  }, [title, reload]);

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
      {issuedUrl && <SecretUrlModal url={issuedUrl} onClose={() => setIssuedUrl(null)} />}

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

      {/* 新規発行 */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="メモの名前(任意・管理用)"
            maxLength={200}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 14,
            }}
          />
          <button
            onClick={() => void issue()}
            disabled={issuing}
            style={{
              padding: '8px 20px',
              border: 'none',
              borderRadius: 6,
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 14,
              opacity: issuing ? 0.6 : 1,
            }}
          >
            {issuing ? '発行中…' : '新しいメモURLを発行'}
          </button>
        </div>
        {issueError && (
          <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{issueError}</p>
        )}
      </section>

      {/* 一覧 */}
      <section>
        {listError && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{listError}</p>}
        {memos === null ? (
          <p style={{ color: 'var(--muted)' }}>読み込み中…</p>
        ) : memos.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>
            メモはまだありません。上のボタンから発行してください。
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {memos.map((m) => (
              <li
                key={m.memo_id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 4px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.title || '(名称未設定)'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    タブ {m.tab_count} · 作成 {fmtJst(m.created_at)} · 更新 {fmtJst(m.updated_at)}
                  </div>
                </div>
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 12,
                    padding: '2px 10px',
                    borderRadius: 99,
                    border: '1px solid var(--border)',
                    color: m.has_active_url ? 'var(--accent)' : 'var(--muted)',
                  }}
                >
                  {m.has_active_url ? '有効' : '無効'}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 16 }}>
          ※ 発行済みURLの再表示はできません(サーバに保存されないため)。再発行・無効化・削除の操作は近日追加。
        </p>
      </section>
    </main>
  );
}
