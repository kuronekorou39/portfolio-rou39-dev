import { useCallback, useEffect, useState, type CSSProperties } from 'react';
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

  // ---- 行操作(リネーム/再発行/無効化/削除) ----
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const rowAction = useCallback(
    async (memoId: string, fn: (idToken: string) => Promise<void>, failMsg: string) => {
      setBusyId(memoId);
      setActionError(null);
      try {
        const idToken = await getIdToken();
        if (!idToken) throw new Error('login');
        await fn(idToken);
        await reload();
      } catch {
        setActionError(failMsg);
      } finally {
        setBusyId(null);
      }
    },
    [reload],
  );

  const onReissue = (m: MemoSummary) => {
    const name = m.title || '(名称未設定)';
    if (!window.confirm(`「${name}」のURLを再発行しますか?\n現在のURLは即座に使えなくなります。`))
      return;
    void rowAction(
      m.memo_id,
      async (idToken) => {
        const r = await api.reissueMemo(idToken, m.memo_id);
        setIssuedUrl(r.url); // 新URLを1回限りモーダルで表示
      },
      '再発行に失敗しました。時間をおいて再試行してください。',
    );
  };

  const onRevoke = (m: MemoSummary) => {
    const name = m.title || '(名称未設定)';
    if (
      !window.confirm(
        `「${name}」のURLを無効化しますか?\n再発行するまで誰もこのメモを開けなくなります。`,
      )
    )
      return;
    void rowAction(
      m.memo_id,
      async (idToken) => {
        await api.revokeMemo(idToken, m.memo_id);
      },
      '無効化に失敗しました。時間をおいて再試行してください。',
    );
  };

  const onDelete = (m: MemoSummary) => {
    const name = m.title || '(名称未設定)';
    if (
      !window.confirm(`「${name}」を削除しますか?\nすべてのタブが消え、元に戻せません。`)
    )
      return;
    void rowAction(
      m.memo_id,
      async (idToken) => {
        await api.deleteMemo(idToken, m.memo_id);
      },
      '削除に失敗しました。時間をおいて再試行してください。',
    );
  };

  const onRenameSave = (memoId: string) => {
    void rowAction(
      memoId,
      async (idToken) => {
        await api.renameMemo(idToken, memoId, renameValue.trim());
        setRenamingId(null);
      },
      '名前の変更に失敗しました。',
    );
  };

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
            {memos.map((m) => {
              const busy = busyId === m.memo_id;
              const actionBtn: CSSProperties = {
                border: 'none',
                background: 'transparent',
                fontSize: 12,
                color: 'var(--accent)',
                padding: '2px 6px',
                opacity: busy ? 0.4 : 1,
                cursor: busy ? 'wait' : 'pointer',
              };
              return (
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
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {renamingId === m.memo_id ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          maxLength={200}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onRenameSave(m.memo_id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          style={{
                            flex: 1,
                            padding: '4px 8px',
                            border: '1px solid var(--border)',
                            borderRadius: 4,
                            fontSize: 14,
                          }}
                        />
                        <button onClick={() => onRenameSave(m.memo_id)} disabled={busy} style={actionBtn}>
                          保存
                        </button>
                        <button
                          onClick={() => setRenamingId(null)}
                          style={{ ...actionBtn, color: 'var(--muted)' }}
                        >
                          キャンセル
                        </button>
                      </div>
                    ) : (
                      <div style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {m.title || '(名称未設定)'}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      タブ {m.tab_count} · 作成 {fmtJst(m.created_at)} · 更新 {fmtJst(m.updated_at)}
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => {
                          setRenamingId(m.memo_id);
                          setRenameValue(m.title);
                        }}
                        disabled={busy}
                        style={actionBtn}
                      >
                        名前変更
                      </button>
                      <button onClick={() => onReissue(m)} disabled={busy} style={actionBtn}>
                        再発行
                      </button>
                      {m.has_active_url && (
                        <button onClick={() => onRevoke(m)} disabled={busy} style={actionBtn}>
                          無効化
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(m)}
                        disabled={busy}
                        style={{ ...actionBtn, color: 'var(--danger)' }}
                      >
                        削除
                      </button>
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
              );
            })}
          </ul>
        )}
        {actionError && (
          <p style={{ fontSize: 13, color: 'var(--danger)', marginTop: 12 }}>{actionError}</p>
        )}
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 16 }}>
          ※ 発行済みURLの再表示はできません(サーバに保存されないため)。URLを失くしたときは「再発行」を(旧URLは無効になります)。
        </p>
      </section>
    </main>
  );
}
