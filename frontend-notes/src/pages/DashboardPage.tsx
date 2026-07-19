import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { beginGoogleLogin, getIdToken } from '../lib/auth';
import { api, ApiError, type AccessLogEntry, type MemoSummary } from '../lib/api';

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

  // アクセス履歴のインライン展開(memo_id → entries / 'loading')
  const [logs, setLogs] = useState<Record<string, AccessLogEntry[] | 'loading'>>({});
  const onToggleLog = async (memoId: string) => {
    if (logs[memoId]) {
      // 既に開いていれば閉じる
      setLogs((prev) => {
        const next = { ...prev };
        delete next[memoId];
        return next;
      });
      return;
    }
    setLogs((prev) => ({ ...prev, [memoId]: 'loading' }));
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('login');
      const r = await api.memoAccessLog(idToken, memoId);
      setLogs((prev) => ({ ...prev, [memoId]: r.entries }));
    } catch {
      setLogs((prev) => {
        const next = { ...prev };
        delete next[memoId];
        return next;
      });
      setActionError('アクセス履歴の取得に失敗しました。');
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '96px 24px', color: 'var(--muted)' }}>
        読み込み中…
      </div>
    );
  }

  if (!user) {
    // 未ログイン時はトップページ(サービス概要 + ログイン導線)
    const feature: CSSProperties = {
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '16px 18px',
      background: '#fff',
      flex: '1 1 200px',
    };
    return (
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '72px 24px 48px' }}>
        <section style={{ textAlign: 'center', marginBottom: 48 }}>
          <h1 style={{ fontSize: 34, margin: '0 0 12px' }}>Stash Notes</h1>
          <p style={{ fontSize: 16, color: 'var(--muted)', margin: '0 0 28px' }}>
            ログインは管理だけ。メモは URL ひとつで開ける、身軽なメモサービス。
          </p>
          <button
            onClick={() => void beginGoogleLogin()}
            style={{
              padding: '12px 32px',
              fontSize: 15,
              border: 'none',
              borderRadius: 8,
              background: 'var(--accent)',
              color: '#fff',
            }}
          >
            Google でログインして始める
          </button>
        </section>

        <section style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 48 }}>
          <div style={feature}>
            <h2 style={{ fontSize: 15, margin: '0 0 6px' }}>秘密URLで即アクセス</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
              発行したURLを知っていれば、ログイン不要でメモを開いて編集できます。ブックマークすれば次からワンタップ。
            </p>
          </div>
          <div style={feature}>
            <h2 style={{ fontSize: 15, margin: '0 0 6px' }}>自動保存と複数タブ</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
              書けば勝手に保存。タブでメモを整理。通信が不安定でも編集はローカルに残ります。
            </p>
          </div>
          <div style={feature}>
            <h2 style={{ fontSize: 15, margin: '0 0 6px' }}>管理はあなたの手に</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
              URLが漏れたら再発行で即無効化。誰がいつ開いたかのアクセス履歴も確認できます。
            </p>
          </div>
        </section>

        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 16, marginBottom: 12, textAlign: 'center' }}>使い方は3ステップ</h2>
          <ol style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 480, margin: '0 auto', paddingLeft: 24 }}>
            <li style={{ marginBottom: 6 }}>Google でログインして管理画面へ</li>
            <li style={{ marginBottom: 6 }}>メモURLを発行(URLはその場で1回だけ表示)</li>
            <li>URLをブックマーク。次からはログイン不要で開くだけ</li>
          </ol>
        </section>

        <footer
          style={{
            borderTop: '1px solid var(--border)',
            paddingTop: 16,
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--muted)',
          }}
        >
          <Link to="/privacy" style={{ color: 'var(--muted)' }}>
            プライバシーポリシー
          </Link>
          <span style={{ margin: '0 8px' }}>·</span>
          <span>© 2026 rou39</span>
        </footer>
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
                      <button onClick={() => void onToggleLog(m.memo_id)} style={actionBtn}>
                        {logs[m.memo_id] ? '履歴を閉じる' : '履歴'}
                      </button>
                      <button
                        onClick={() => onDelete(m)}
                        disabled={busy}
                        style={{ ...actionBtn, color: 'var(--danger)' }}
                      >
                        削除
                      </button>
                    </div>
                    {logs[m.memo_id] === 'loading' && (
                      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 0' }}>
                        読み込み中…
                      </p>
                    )}
                    {Array.isArray(logs[m.memo_id]) && (
                      <ul style={{ listStyle: 'none', padding: '6px 0 0', margin: 0 }}>
                        {(logs[m.memo_id] as AccessLogEntry[]).length === 0 && (
                          <li style={{ fontSize: 12, color: 'var(--muted)' }}>
                            アクセスはまだありません。
                          </li>
                        )}
                        {(logs[m.memo_id] as AccessLogEntry[]).map((e, i) => (
                          <li
                            key={i}
                            style={{
                              display: 'flex',
                              gap: 10,
                              fontSize: 12,
                              color: 'var(--muted)',
                              padding: '2px 0',
                            }}
                          >
                            <span style={{ flexShrink: 0 }}>{fmtJst(e.ts)}</span>
                            <span
                              style={{ fontFamily: 'var(--font-mono)', flexShrink: 0 }}
                              title="アクセス元のIPアドレス"
                            >
                              {e.ip || e.ip_hash.slice(0, 8)}
                            </span>
                            <span
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {e.ua}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
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

      <footer
        style={{
          borderTop: '1px solid var(--border)',
          marginTop: 40,
          paddingTop: 12,
          fontSize: 12,
          color: 'var(--muted)',
        }}
      >
        <Link to="/privacy" style={{ color: 'var(--muted)' }}>
          プライバシーポリシー
        </Link>
      </footer>
    </main>
  );
}
