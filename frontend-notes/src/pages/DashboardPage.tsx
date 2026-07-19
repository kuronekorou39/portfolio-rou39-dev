import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { beginGoogleLogin, getIdToken } from '../lib/auth';
import { api, ApiError, type AccessLogEntry, type MemoSummary } from '../lib/api';
import ThemeToggle from '../components/ThemeToggle';

// backend の MAX_MEMOS_PER_USER と一致させる(残り作成可能数の表示用)
const MAX_MEMOS = 20;

function fmtJst(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

/** 発行直後の秘密URLを1回だけ見せるモーダル(サーバはハッシュのみ保持=再表示不可)。 */
function SecretUrlModal({
  url,
  readonly,
  onClose,
}: {
  url: string;
  readonly?: boolean;
  onClose: () => void;
}) {
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
          background: 'var(--surface)',
          borderRadius: 8,
          padding: 24,
          maxWidth: 560,
          width: '100%',
        }}
      >
        <h2 style={{ fontSize: 17, marginTop: 0 }}>
          {readonly ? '読み取り専用URL を発行しました' : 'メモURL を発行しました'}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          {readonly
            ? 'この URL を知っている人は、メモを閲覧できます(編集はできません)。一覧からいつでも確認できます。'
            : 'URL を知っている人は誰でもこのメモを開けます。一覧からいつでも確認できます。漏洩したときは「再発行」で旧URLを無効化してください。'}
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
              color: copied ? 'var(--accent-fg)' : 'var(--accent)',
              background: copied ? 'var(--accent)' : 'var(--surface)',
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
              background: 'var(--surface)',
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

// ---- 共通の見た目部品(既存トークンで実ボタン化)----
type BtnVariant = 'default' | 'primary' | 'danger' | 'ghost';
const btnStyle = (variant: BtnVariant, busy?: boolean): CSSProperties => {
  const base: CSSProperties = {
    fontFamily: 'inherit',
    fontSize: 12.5,
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 11px',
    borderRadius: 7,
    cursor: busy ? 'wait' : 'pointer',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--fg)',
    whiteSpace: 'nowrap',
    opacity: busy ? 0.5 : 1,
  };
  if (variant === 'primary')
    return { ...base, background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--accent-fg)' };
  if (variant === 'danger') return { ...base, color: 'var(--danger)' };
  if (variant === 'ghost') return { ...base, border: '1px solid transparent', background: 'transparent', color: 'var(--muted)' };
  return base;
};

function Btn({
  children,
  onClick,
  variant = 'default',
  busy,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  busy?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled || busy} title={title} style={btnStyle(variant, busy)}>
      {children}
    </button>
  );
}

function Badge({ kind, children }: { kind: 'ok' | 'off' | 'pin'; children: React.ReactNode }) {
  const c: CSSProperties =
    kind === 'ok'
      ? { color: 'var(--ok)', background: 'var(--ok-soft)' }
      : kind === 'pin'
        ? { color: 'var(--accent)', background: 'var(--accent-soft)' }
        : { color: 'var(--muted)', border: '1px solid var(--border)' };
  return (
    <span
      style={{
        fontSize: 11.5,
        fontWeight: 550,
        padding: '3px 9px',
        borderRadius: 99,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        border: '1px solid transparent',
        ...c,
      }}
    >
      {children}
    </span>
  );
}

/** URL は1行フル幅で表示し、操作(コピー/開く/再発行/無効化)は下段に分離する。 */
function UrlBlock({
  label,
  url,
  emptyText,
  onIssue,
  issueLabel = '発行する',
  issuePrimary,
  onReissue,
  onRevoke,
  busy,
}: {
  label: string;
  url: string | null;
  active: boolean;
  emptyText: string;
  onIssue: () => void;
  issueLabel?: string;
  issuePrimary?: boolean;
  onReissue: () => void;
  onRevoke?: () => void;
  busy?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 5 }}>{label}</div>
      {url ? (
        <>
          <code
            style={{
              display: 'block',
              width: '100%',
              fontFamily: 'var(--font-mono)',
              fontSize: 12.5,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '9px 12px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'var(--fg)',
            }}
            title={url}
          >
            {url}
          </code>
          <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
            <Btn
              busy={busy}
              onClick={() =>
                void navigator.clipboard.writeText(url).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
              }
            >
              {copied ? 'コピー済' : 'コピー'}
            </Btn>
            <Btn onClick={() => window.open(url, '_blank', 'noopener')}>開く ↗</Btn>
            <Btn busy={busy} onClick={onReissue}>
              ↻ 再発行
            </Btn>
            {onRevoke && (
              <Btn busy={busy} variant="danger" onClick={onRevoke}>
                無効化
              </Btn>
            )}
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              width: '100%',
              fontSize: 12.5,
              color: 'var(--muted)',
              border: '1px dashed var(--border)',
              borderRadius: 8,
              padding: '9px 12px',
            }}
          >
            {emptyText}
          </div>
          <div style={{ marginTop: 7 }}>
            <Btn busy={busy} variant={issuePrimary ? 'primary' : 'default'} onClick={onIssue}>
              {issueLabel}
            </Btn>
          </div>
        </>
      )}
    </div>
  );
}

/** アクセス履歴モーダル(件数が多くてもモーダル内スクロールで収める)。 */
function AccessLogModal({
  memoTitle,
  entries,
  onClose,
}: {
  memoTitle: string;
  entries: AccessLogEntry[] | 'loading';
  onClose: () => void;
}) {
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 20,
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          width: '100%',
          maxWidth: 540,
          maxHeight: '82vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 18px 12px',
            gap: 10,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            アクセス履歴 — {memoTitle}
          </h3>
          <Btn variant="ghost" onClick={onClose}>
            ✕ 閉じる
          </Btn>
        </div>
        <div style={{ overflowY: 'auto', padding: '0 18px' }}>
          {entries === 'loading' ? (
            <p style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>読み込み中…</p>
          ) : entries.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>
              アクセスはまだありません。
            </p>
          ) : (
            entries.map((e, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '150px auto 1fr',
                  gap: 12,
                  alignItems: 'center',
                  fontSize: 12.5,
                  color: 'var(--muted)',
                  padding: '9px 0',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <span style={{ color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtJst(e.ts)}
                </span>
                {e.via === 'ro' ? (
                  <span
                    style={{
                      color: 'var(--accent)',
                      fontSize: 11,
                      background: 'var(--accent-soft)',
                      borderRadius: 99,
                      padding: '1px 7px',
                      justifySelf: 'start',
                    }}
                  >
                    閲覧専用
                  </span>
                ) : (
                  <span />
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{e.ip || e.ip_hash.slice(0, 8)}</span>
                  {e.ua ? ` · ${e.ua}` : ''}
                </span>
              </div>
            ))
          )}
        </div>
        <div style={{ padding: '12px 18px 16px', fontSize: 12, color: 'var(--muted)' }}>
          最新 50 件を表示しています。記録は 90 日で自動的に削除されます。
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
  const [issuedReadonly, setIssuedReadonly] = useState(false);

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
      setIssuedReadonly(false);
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
        setIssuedReadonly(false);
        setIssuedUrl(r.url); // 新URLを1回限りモーダルで表示
      },
      '再発行に失敗しました。時間をおいて再試行してください。',
    );
  };

  const onIssueReadonly = (m: MemoSummary) => {
    const name = m.title || '(名称未設定)';
    if (
      m.has_readonly_url &&
      !window.confirm(
        `「${name}」の読み取り専用URLを再発行しますか?\n現在の読み取り専用URLは使えなくなります(編集用URLは影響しません)。`,
      )
    )
      return;
    void rowAction(
      m.memo_id,
      async (idToken) => {
        const r = await api.issueReadonly(idToken, m.memo_id);
        setIssuedReadonly(true);
        setIssuedUrl(r.url);
      },
      '読み取り専用URLの発行に失敗しました。時間をおいて再試行してください。',
    );
  };

  const onRevokeReadonly = (m: MemoSummary) => {
    const name = m.title || '(名称未設定)';
    if (!window.confirm(`「${name}」の読み取り専用URLを無効化しますか?`)) return;
    void rowAction(
      m.memo_id,
      async (idToken) => {
        await api.revokeReadonly(idToken, m.memo_id);
      },
      '読み取り専用URLの無効化に失敗しました。時間をおいて再試行してください。',
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

  // PIN 設定/変更/解除のインライン UI
  const [pinEditId, setPinEditId] = useState<string | null>(null);
  const [pinValue, setPinValue] = useState('');
  const onSetPin = (memoId: string) => {
    if (pinValue.length < 6 || pinValue.length > 10) {
      setActionError('PIN は6〜10桁の数字で入力してください。');
      return;
    }
    void rowAction(
      memoId,
      async (idToken) => {
        await api.setPin(idToken, memoId, pinValue);
        setPinEditId(null);
        setPinValue('');
      },
      'PIN の設定に失敗しました。',
    );
  };
  const onClearPin = (m: MemoSummary) => {
    if (!window.confirm(`「${m.title || '(名称未設定)'}」の PIN を解除しますか?`)) return;
    void rowAction(
      m.memo_id,
      async (idToken) => {
        await api.setPin(idToken, m.memo_id, null);
      },
      'PIN の解除に失敗しました。',
    );
  };

  // アクセス履歴モーダル(1メモ分をモーダルで表示。件数が多くてもスクロールで収める)
  const [logModal, setLogModal] = useState<{
    memo: MemoSummary;
    entries: AccessLogEntry[] | 'loading';
  } | null>(null);
  const openLog = async (m: MemoSummary) => {
    setLogModal({ memo: m, entries: 'loading' });
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('login');
      const r = await api.memoAccessLog(idToken, m.memo_id);
      setLogModal({ memo: m, entries: r.entries });
    } catch {
      setLogModal(null);
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
      background: 'var(--surface)',
      flex: '1 1 200px',
    };
    return (
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '24px 24px 48px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 32 }}>
          <ThemeToggle />
        </div>
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
              color: 'var(--accent-fg)',
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

  const remaining = memos ? Math.max(0, MAX_MEMOS - memos.length) : null;

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '20px 20px 64px' }}>
      {issuedUrl && (
        <SecretUrlModal url={issuedUrl} readonly={issuedReadonly} onClose={() => setIssuedUrl(null)} />
      )}
      {logModal && (
        <AccessLogModal
          memoTitle={logModal.memo.title || '(名称未設定)'}
          entries={logModal.entries}
          onClose={() => setLogModal(null)}
        />
      )}

      {/* ツールバー */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          borderBottom: '1px solid var(--border)',
          paddingBottom: 16,
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 650, margin: 0, letterSpacing: '-0.01em' }}>
          Stash Notes
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--muted)' }}>
          <ThemeToggle />
          <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.email}
          </span>
          <Btn onClick={signOut}>ログアウト</Btn>
        </div>
      </header>

      {/* 新規発行 */}
      <section style={{ margin: '24px 0 6px' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !issuing) void issue();
            }}
            placeholder="メモの名前(任意・あとで変更できます)"
            maxLength={200}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '10px 14px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 14,
              background: 'var(--surface)',
            }}
          />
          <Btn variant="primary" busy={issuing} onClick={() => void issue()}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            {issuing ? '発行中…' : 'メモを新規発行'}
          </Btn>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0 2px' }}>
          {issueError ? (
            <span style={{ color: 'var(--danger)' }}>{issueError}</span>
          ) : (
            <>発行するとメモ用の秘密URLが作られます{remaining !== null && `(あと ${remaining} 個作れます)`}。</>
          )}
        </p>
      </section>

      {/* 一覧 */}
      <section style={{ marginTop: 26 }}>
        {listError && (
          <p style={{ color: 'var(--danger)', fontSize: 13 }}>{listError}</p>
        )}
        {actionError && (
          <p style={{ color: 'var(--danger)', fontSize: 13 }}>{actionError}</p>
        )}
        {memos === null ? (
          <p style={{ color: 'var(--muted)' }}>読み込み中…</p>
        ) : memos.length === 0 ? (
          <div
            style={{
              border: '1px dashed var(--border)',
              borderRadius: 12,
              padding: '40px 24px',
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: 14,
            }}
          >
            メモはまだありません。上の「メモを新規発行」から作成してください。
          </div>
        ) : (
          memos.map((m) => {
            const busy = busyId === m.memo_id;
            return (
              <div
                key={m.memo_id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  background: 'var(--surface)',
                  padding: '16px 18px',
                  marginBottom: 14,
                }}
              >
                {/* ヘッダー: タイトル + 状態バッジ */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  {renamingId === m.memo_id ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1 }}>
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
                          minWidth: 0,
                          padding: '6px 10px',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          fontSize: 15,
                          background: 'var(--surface)',
                        }}
                      />
                      <Btn busy={busy} onClick={() => onRenameSave(m.memo_id)}>
                        保存
                      </Btn>
                      <Btn variant="ghost" onClick={() => setRenamingId(null)}>
                        キャンセル
                      </Btn>
                    </div>
                  ) : (
                    <h2
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        margin: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        minWidth: 0,
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: m.title ? undefined : 'var(--muted)', fontWeight: m.title ? 600 : 500 }}>
                        {m.title || '名称未設定のメモ'}
                      </span>
                      <button
                        title="名前を変更"
                        onClick={() => {
                          setRenamingId(m.memo_id);
                          setRenameValue(m.title);
                        }}
                        style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, padding: 0 }}
                      >
                        ✎
                      </button>
                    </h2>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {m.has_active_url ? <Badge kind="ok">● 公開中</Badge> : <Badge kind="off">停止中</Badge>}
                    {m.has_pin && <Badge kind="pin">🔒 PIN</Badge>}
                  </div>
                </div>

                <div style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 16px', fontVariantNumeric: 'tabular-nums' }}>
                  タブ <b style={{ color: 'var(--fg)' }}>{m.tab_count}</b> ・ 作成{' '}
                  <b style={{ color: 'var(--fg)' }}>{fmtJst(m.created_at)}</b> ・ 最終更新{' '}
                  <b style={{ color: 'var(--fg)' }}>{fmtJst(m.updated_at)}</b>
                </div>

                {/* 編集URL */}
                <UrlBlock
                  label="編集URL"
                  url={m.url}
                  active={m.has_active_url}
                  emptyText={
                    m.has_active_url
                      ? 'URLは発行済みです(表示するには再発行してください)'
                      : '無効化されています — 誰も開けません'
                  }
                  onIssue={() => onReissue(m)}
                  issueLabel="URLを発行"
                  issuePrimary
                  onReissue={() => onReissue(m)}
                  onRevoke={m.has_active_url ? () => onRevoke(m) : undefined}
                  busy={busy}
                />

                {/* 閲覧専用URL */}
                <UrlBlock
                  label="閲覧専用URL"
                  url={m.readonly_url}
                  active={m.has_readonly_url}
                  emptyText="未発行 — 閲覧だけ許可したい相手に渡せます"
                  onIssue={() => onIssueReadonly(m)}
                  issueLabel="発行する"
                  onReissue={() => onIssueReadonly(m)}
                  onRevoke={m.has_readonly_url ? () => onRevokeReadonly(m) : undefined}
                  busy={busy}
                />

                {/* PIN のインライン編集 */}
                {pinEditId === m.memo_id && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>PIN(6〜10桁)</span>
                    <input
                      value={pinValue}
                      onChange={(e) => setPinValue(e.target.value.replace(/[^0-9]/g, ''))}
                      inputMode="numeric"
                      autoFocus
                      maxLength={10}
                      placeholder="••••••"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onSetPin(m.memo_id);
                        if (e.key === 'Escape') {
                          setPinEditId(null);
                          setPinValue('');
                        }
                      }}
                      style={{
                        width: 120,
                        padding: '6px 10px',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        fontSize: 13,
                        letterSpacing: 3,
                        background: 'var(--surface)',
                      }}
                    />
                    <Btn busy={busy} onClick={() => onSetPin(m.memo_id)}>
                      保存
                    </Btn>
                    <Btn
                      variant="ghost"
                      onClick={() => {
                        setPinEditId(null);
                        setPinValue('');
                      }}
                    >
                      キャンセル
                    </Btn>
                  </div>
                )}

                {/* フッター操作 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flexWrap: 'wrap',
                    marginTop: 6,
                    paddingTop: 13,
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  {pinEditId !== m.memo_id && (
                    <Btn
                      busy={busy}
                      onClick={() => {
                        setPinEditId(m.memo_id);
                        setPinValue('');
                      }}
                    >
                      {m.has_pin ? 'PIN を変更' : 'PIN を設定'}
                    </Btn>
                  )}
                  {m.has_pin && pinEditId !== m.memo_id && (
                    <Btn busy={busy} onClick={() => onClearPin(m)}>
                      PIN を解除
                    </Btn>
                  )}
                  <Btn onClick={() => void openLog(m)}>アクセス履歴</Btn>
                  <span style={{ flex: 1 }} />
                  <Btn busy={busy} variant="danger" onClick={() => onDelete(m)}>
                    削除
                  </Btn>
                </div>
              </div>
            );
          })
        )}
      </section>

      <footer
        style={{
          borderTop: '1px solid var(--border)',
          marginTop: 40,
          paddingTop: 14,
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
