import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getIdToken } from '../lib/auth';
import {
  api,
  ApiError,
  PIN_MIN_LEN,
  type AccessLogEntry,
  type MemoSummary,
  type TokenMode,
} from '../lib/api';
import ThemeToggle from '../components/ThemeToggle';
import Loading from '../components/Loading';
import Landing from './Landing';

// backend の MAX_MEMOS_PER_USER と一致させる(残り作成可能数の表示用)
const MAX_MEMOS = 20;

function fmtJst(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

/** 今から n 日後の ISO 文字列(有効期限プリセット用)。 */
function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();
}

/** 有効期限までの残り時間を「あと N日/時間/分」で表す。 */
function fmtRemaining(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return '期限切れ';
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `あと${days}日`;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 1) return `あと${hours}時間`;
  return `あと${Math.max(1, Math.floor(ms / (60 * 1000)))}分`;
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
        zIndex: 30,
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

function Badge({
  kind,
  children,
}: {
  kind: 'ok' | 'off' | 'pin' | 'expired';
  children: React.ReactNode;
}) {
  const c: CSSProperties =
    kind === 'ok'
      ? { color: 'var(--ok)', background: 'var(--ok-soft)' }
      : kind === 'pin'
        ? { color: 'var(--accent)', background: 'var(--accent-soft)' }
        : kind === 'expired'
          ? { color: 'var(--danger)', background: 'var(--danger-soft)' }
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

/** 「?」アイコンのポップオーバー。常設の説明文を置かず、必要な人だけが開ける。 */
function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-label="説明"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--muted)',
          fontSize: 11,
          lineHeight: 1,
          padding: 0,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 5,
            width: 230,
            fontWeight: 400,
            fontSize: 12,
            lineHeight: 1.5,
            color: 'var(--fg)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 10px',
            boxShadow: '0 6px 20px rgba(0,0,0,.14)',
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

/** URL は1行フル幅で表示し、操作(再発行/無効化/有効期限)は下段に分離する。 */
function UrlBlock({
  label,
  url,
  emptyText,
  onIssue,
  issueLabel = '発行する',
  issuePrimary,
  onReissue,
  onRevoke,
  expiresAt,
  expired,
  onSetExpiry,
  busy,
}: {
  label: React.ReactNode;
  url: string | null;
  active: boolean;
  emptyText: string;
  onIssue: () => void;
  issueLabel?: string;
  issuePrimary?: boolean;
  onReissue: () => void;
  onRevoke?: () => void;
  /** 有効期限(ISO)。null=無期限。 */
  expiresAt: string | null;
  /** 期限切れか。 */
  expired: boolean;
  /** 期限の設定/延長/クリア(null=無期限化=復活)。 */
  onSetExpiry: (expiresAt: string | null) => void;
  busy?: boolean;
}) {
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
          {/* コピー/開くは一覧にあるので、ここは発行状態の操作だけ(再発行/無効化)。 */}
          <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
            <Btn busy={busy} onClick={onReissue}>
              ↻ 再発行
            </Btn>
            {onRevoke && (
              <Btn busy={busy} variant="danger" onClick={onRevoke}>
                無効化
              </Btn>
            )}
          </div>

          {/* 有効期限(可逆): 期限切れでもデータは消えず、復活で同じURLが生き返る */}
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
            {expired ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Badge kind="expired">⌛ 期限切れ</Badge>
                このURLは今開けません(データは残っています)
              </span>
            ) : expiresAt ? (
              <span>
                有効期限: <b style={{ color: 'var(--fg)' }}>{fmtJst(expiresAt)}</b>(
                {fmtRemaining(expiresAt)})
              </span>
            ) : (
              <span>有効期限: なし(無期限)</span>
            )}
          </div>
          <div
            style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}
          >
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
              {expired ? '復活:' : '期限:'}
            </span>
            <Btn busy={busy} onClick={() => onSetExpiry(daysFromNow(1))}>
              1日
            </Btn>
            <Btn busy={busy} onClick={() => onSetExpiry(daysFromNow(7))}>
              7日
            </Btn>
            <Btn busy={busy} onClick={() => onSetExpiry(daysFromNow(30))}>
              30日
            </Btn>
            <Btn
              busy={busy}
              variant={expired ? 'primary' : 'default'}
              onClick={() => onSetExpiry(null)}
            >
              無期限
            </Btn>
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
            <div style={{ padding: '16px 0' }}>
              <Loading block={false} />
            </div>
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

/** 編集用/閲覧のみを「色 + アイコン + 文言」の3重で区別するラベル(渡し間違い防止)。 */
function UrlKindBadge({ kind }: { kind: 'edit' | 'view' }) {
  const isEdit = kind === 'edit';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
        width: 78,
        fontSize: 11.5,
        fontWeight: 650,
        padding: '3px 9px',
        borderRadius: 7,
        color: isEdit ? 'var(--accent)' : 'var(--ok)',
        background: isEdit ? 'var(--accent-soft)' : 'var(--ok-soft)',
      }}
    >
      {isEdit ? '✎ 編集用' : '👁 閲覧用'}
    </span>
  );
}

/** 一覧の1URL行: 用途バッジ + クリックで開けるURL + コピー。停止中/期限切れは用途説明を出す。 */
function ListUrlRow({
  kind,
  url,
  revokedText,
  expired,
}: {
  kind: 'edit' | 'view';
  url: string | null;
  revokedText: string;
  /** 期限切れ(URL自体は残っているが今は開けない)。 */
  expired?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 0' }}>
      <UrlKindBadge kind={kind} />
      {url && expired ? (
        <span
          style={{
            flex: 1,
            fontSize: 12.5,
            color: 'var(--muted)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            minWidth: 0,
          }}
        >
          <Badge kind="expired">⌛ 期限切れ</Badge>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            設定から復活できます
          </span>
        </span>
      ) : url ? (
        <>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title="新しいタブで開く"
            style={{
              flex: 1,
              minWidth: 0,
              fontFamily: 'var(--font-mono)',
              fontSize: 12.5,
              color: 'var(--fg)',
              textDecoration: 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {url}
          </a>
          <Btn
            onClick={() =>
              void navigator.clipboard.writeText(url).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
            }
          >
            {copied ? 'コピー済' : 'コピー'}
          </Btn>
        </>
      ) : (
        <span style={{ flex: 1, fontSize: 12.5, color: 'var(--muted)' }}>{revokedText}</span>
      )}
    </div>
  );
}

/** 1メモの詳細操作をまとめる設定モーダル。一覧は最小限に保ち、操作はすべてここへ集約する。 */
function SettingsModal({
  memo,
  busy,
  actionError,
  onClose,
  onRename,
  onReissue,
  onRevoke,
  onIssueReadonly,
  onRevokeReadonly,
  onSetPin,
  onClearPin,
  onSetExpiry,
  onDelete,
  onOpenLog,
}: {
  memo: MemoSummary;
  busy: boolean;
  /** 直近の操作エラー(モーダル内に表示。背後の一覧のエラー行はオーバーレイで隠れるため)。 */
  actionError: string | null;
  onClose: () => void;
  onRename: (memoId: string, value: string) => Promise<boolean>;
  onReissue: (m: MemoSummary) => void;
  onRevoke: (m: MemoSummary) => void;
  onIssueReadonly: (m: MemoSummary) => void;
  onRevokeReadonly: (m: MemoSummary) => void;
  onSetPin: (memoId: string, pin: string) => Promise<boolean>;
  onClearPin: (m: MemoSummary) => Promise<boolean>;
  onSetExpiry: (memoId: string, kind: TokenMode, expiresAt: string | null) => void;
  onDelete: (m: MemoSummary) => void;
  onOpenLog: (m: MemoSummary) => void;
}) {
  const [titleInput, setTitleInput] = useState(memo.title);
  const [titleSaved, setTitleSaved] = useState(false);
  const [pinEditing, setPinEditing] = useState(false);
  const [pinInput, setPinInput] = useState('');

  const saveTitle = async () => {
    const ok = await onRename(memo.memo_id, titleInput);
    if (ok) {
      setTitleSaved(true);
      setTimeout(() => setTitleSaved(false), 1500);
    }
  };
  const savePin = async () => {
    const ok = await onSetPin(memo.memo_id, pinInput);
    if (ok) {
      setPinEditing(false);
      setPinInput('');
    }
  };

  const sec: CSSProperties = { padding: '15px 0', borderTop: '1px solid var(--border)' };
  const secLabel: CSSProperties = {
    fontSize: 12,
    color: 'var(--muted)',
    marginBottom: 8,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

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
          maxHeight: '86vh',
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
            borderBottom: '1px solid var(--border)',
            gap: 10,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16 }}>設定</h3>
          <Btn variant="ghost" onClick={onClose}>
            ✕ 閉じる
          </Btn>
        </div>

        <div style={{ overflowY: 'auto', padding: '0 18px 8px' }}>
          {actionError && (
            <p
              style={{
                color: 'var(--danger)',
                background: 'var(--danger-soft)',
                fontSize: 12.5,
                margin: '12px 0 0',
                padding: '8px 11px',
                borderRadius: 7,
              }}
            >
              {actionError}
            </p>
          )}
          {/* 名前 */}
          <div style={{ ...sec, borderTop: 'none' }}>
            <div style={secLabel}>メモの名前(任意・管理用)</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                maxLength={200}
                placeholder="例: 買い物リスト"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveTitle();
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '8px 11px',
                  border: '1px solid var(--border)',
                  borderRadius: 7,
                  fontSize: 13,
                  background: 'var(--surface)',
                }}
              />
              <Btn busy={busy} onClick={() => void saveTitle()}>
                {titleSaved ? '保存済' : '保存'}
              </Btn>
            </div>
          </div>

          {/* 編集用URL */}
          <div style={sec}>
            <UrlBlock
              label={<b style={{ color: 'var(--accent)', fontWeight: 650 }}>✎ 編集用URL</b>}
              url={memo.url}
              active={memo.has_active_url}
              emptyText={
                memo.has_active_url
                  ? 'URLは発行済みです(表示するには再発行してください)'
                  : '無効化されています — 誰も開けません'
              }
              onIssue={() => onReissue(memo)}
              issueLabel="URLを発行"
              issuePrimary
              onReissue={() => onReissue(memo)}
              onRevoke={memo.has_active_url ? () => onRevoke(memo) : undefined}
              expiresAt={memo.url_expires_at}
              expired={memo.url_expired}
              onSetExpiry={(exp) => onSetExpiry(memo.memo_id, 'rw', exp)}
              busy={busy}
            />
          </div>

          {/* 閲覧のみURL */}
          <div style={sec}>
            <UrlBlock
              label={<b style={{ color: 'var(--ok)', fontWeight: 650 }}>👁 閲覧用URL</b>}
              url={memo.readonly_url}
              active={memo.has_readonly_url}
              emptyText="未発行 — 閲覧だけ許可する相手に渡せます"
              onIssue={() => onIssueReadonly(memo)}
              issueLabel="発行する"
              onReissue={() => onIssueReadonly(memo)}
              onRevoke={memo.has_readonly_url ? () => onRevokeReadonly(memo) : undefined}
              expiresAt={memo.readonly_url_expires_at}
              expired={memo.readonly_url_expired}
              onSetExpiry={(exp) => onSetExpiry(memo.memo_id, 'ro', exp)}
              busy={busy}
            />
          </div>

          {/* PIN */}
          <div style={sec}>
            <div style={secLabel}>
              PIN{' '}
              {memo.has_pin ? (
                <Badge kind="pin">🔒 設定済み</Badge>
              ) : (
                <span style={{ color: 'var(--muted)' }}>未設定</span>
              )}
              <HelpTip
                text={`URL に加えて暗証番号(数字・${PIN_MIN_LEN}桁以上、桁数は自由)の入力を必須にします。`}
              />
            </div>
            {pinEditing ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/[^0-9]/g, ''))}
                  inputMode="numeric"
                  autoFocus
                  maxLength={64}
                  placeholder={`${PIN_MIN_LEN}桁以上`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void savePin();
                    if (e.key === 'Escape') {
                      setPinEditing(false);
                      setPinInput('');
                    }
                  }}
                  style={{
                    width: 130,
                    padding: '7px 10px',
                    border: '1px solid var(--border)',
                    borderRadius: 7,
                    fontSize: 13,
                    letterSpacing: 3,
                    background: 'var(--surface)',
                  }}
                />
                <Btn busy={busy} onClick={() => void savePin()}>
                  保存
                </Btn>
                <Btn
                  variant="ghost"
                  onClick={() => {
                    setPinEditing(false);
                    setPinInput('');
                  }}
                >
                  キャンセル
                </Btn>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Btn busy={busy} onClick={() => {
                  setPinEditing(true);
                  setPinInput('');
                }}>
                  {memo.has_pin ? '変更' : '設定'}
                </Btn>
                {memo.has_pin && (
                  <Btn busy={busy} onClick={() => void onClearPin(memo)}>
                    解除
                  </Btn>
                )}
              </div>
            )}
          </div>

          {/* 履歴 / 削除 */}
          <div
            style={{
              ...sec,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <Btn onClick={() => onOpenLog(memo)}>アクセス履歴を見る</Btn>
            <Btn busy={busy} variant="danger" onClick={() => onDelete(memo)}>
              このメモを削除
            </Btn>
          </div>
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
  // 設定モーダルを開いているメモID(一覧は最小限、詳細操作はモーダルに集約)
  const [settingsId, setSettingsId] = useState<string | null>(null);

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

  // ---- 行操作(再発行/無効化/削除/リネーム/PIN) ----
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  /** 認証付き操作の共通ラッパ。成功で true、失敗で false を返す(モーダルが後処理に使う)。 */
  const rowAction = useCallback(
    async (
      memoId: string,
      fn: (idToken: string) => Promise<void>,
      failMsg: string,
    ): Promise<boolean> => {
      setBusyId(memoId);
      setActionError(null);
      try {
        const idToken = await getIdToken();
        if (!idToken) throw new Error('login');
        await fn(idToken);
        await reload();
        return true;
      } catch {
        setActionError(failMsg);
        return false;
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
    void (async () => {
      const ok = await rowAction(
        m.memo_id,
        async (idToken) => {
          await api.deleteMemo(idToken, m.memo_id);
        },
        '削除に失敗しました。時間をおいて再試行してください。',
      );
      if (ok) setSettingsId(null); // 削除できたら設定モーダルを閉じる
    })();
  };

  // 名前の保存(値は設定モーダルのローカル state から渡す)
  const onRename = (memoId: string, value: string): Promise<boolean> =>
    rowAction(
      memoId,
      async (idToken) => {
        await api.renameMemo(idToken, memoId, value.trim());
      },
      '名前の変更に失敗しました。',
    );

  // PIN 設定/解除(値は設定モーダルのローカル state から渡す)。桁数は固定せず下限のみ。
  const onSetPin = (memoId: string, pin: string): Promise<boolean> => {
    if (pin.length < PIN_MIN_LEN) {
      setActionError(`PIN は${PIN_MIN_LEN}桁以上の数字で入力してください。`);
      return Promise.resolve(false);
    }
    return rowAction(
      memoId,
      async (idToken) => {
        await api.setPin(idToken, memoId, pin);
      },
      'PIN の設定に失敗しました。',
    );
  };
  const onClearPin = (m: MemoSummary): Promise<boolean> =>
    rowAction(
      m.memo_id,
      async (idToken) => {
        await api.setPin(idToken, m.memo_id, null);
      },
      'PIN の解除に失敗しました。',
    );

  // 秘密URLの有効期限を設定/延長/クリア(可逆)。expiresAt=null で無期限化=復活。
  const onSetExpiry = (memoId: string, kind: TokenMode, expiresAt: string | null): void => {
    void rowAction(
      memoId,
      async (idToken) => {
        await api.setUrlExpiry(idToken, memoId, kind, expiresAt);
      },
      expiresAt === null
        ? '有効期限の解除に失敗しました。時間をおいて再試行してください。'
        : '有効期限の設定に失敗しました。時間をおいて再試行してください。',
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
    return <Loading />;
  }

  if (!user) {
    return <Landing />;
  }

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '20px 20px 64px' }}>
      {issuedUrl && (
        <SecretUrlModal url={issuedUrl} readonly={issuedReadonly} onClose={() => setIssuedUrl(null)} />
      )}
      {settingsId &&
        memos &&
        (() => {
          const sm = memos.find((x) => x.memo_id === settingsId);
          if (!sm) return null;
          return (
            <SettingsModal
              memo={sm}
              busy={busyId === sm.memo_id}
              actionError={actionError}
              onClose={() => setSettingsId(null)}
              onRename={onRename}
              onReissue={onReissue}
              onRevoke={onRevoke}
              onIssueReadonly={onIssueReadonly}
              onRevokeReadonly={onRevokeReadonly}
              onSetPin={onSetPin}
              onClearPin={onClearPin}
              onSetExpiry={onSetExpiry}
              onDelete={onDelete}
              onOpenLog={(m) => void openLog(m)}
            />
          );
        })()}
      {logModal && (
        <AccessLogModal
          memoTitle={logModal.memo.title || '(名称未設定)'}
          entries={logModal.entries}
          onClose={() => setLogModal(null)}
        />
      )}

      {/* ツールバー(狭幅では折り返して横溢れを防ぐ) */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          borderBottom: '1px solid var(--border)',
          paddingBottom: 16,
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 650, margin: 0, letterSpacing: '-0.01em' }}>
          Stash Notes
        </h1>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            fontSize: 13,
            color: 'var(--muted)',
          }}
        >
          <ThemeToggle />
          <span style={{ maxWidth: 180, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            margin: '8px 2px 0',
            fontSize: 12,
            color: 'var(--muted)',
            minHeight: 16,
          }}
        >
          {issueError && <span style={{ color: 'var(--danger)' }}>{issueError}</span>}
          {memos && (
            <span
              style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}
              title="作成済み / 上限"
            >
              {memos.length} / {MAX_MEMOS}
            </span>
          )}
        </div>
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
          <Loading label="" />
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
                  borderRadius: 11,
                  background: 'var(--surface)',
                  padding: '13px 15px',
                  marginBottom: 10,
                }}
              >
                {/* 上段: 名前(任意) + PIN印 + 設定 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: m.title ? 600 : 500,
                      fontStyle: m.title ? undefined : 'italic',
                      color: m.title ? undefined : 'var(--muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {m.title || '名称未設定'}
                  </span>
                  {m.has_pin && (
                    <span title="PIN で保護" style={{ fontSize: 12, flexShrink: 0 }}>
                      🔒
                    </span>
                  )}
                  <span style={{ flex: 1 }} />
                  <Btn
                    busy={busy}
                    onClick={() => {
                      setActionError(null); // 前回のエラーを持ち込まない
                      setSettingsId(m.memo_id);
                    }}
                  >
                    ⚙ 設定
                  </Btn>
                </div>

                {/* 編集用URL(停止中/期限切れも用途を表示) */}
                <ListUrlRow
                  kind="edit"
                  url={m.url}
                  expired={m.url_expired}
                  revokedText="URLは停止中です — 設定から発行できます"
                />
                {/* 閲覧のみURL(発行済みのときだけ) */}
                {m.has_readonly_url && (
                  <ListUrlRow
                    kind="view"
                    url={m.readonly_url}
                    expired={m.readonly_url_expired}
                    revokedText=""
                  />
                )}

                {/* メタ: タブ数 ・ 最終更新 */}
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--muted)',
                    marginTop: 8,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  タブ <b style={{ color: 'var(--fg)' }}>{m.tab_count}</b> ・ 最終更新{' '}
                  <b style={{ color: 'var(--fg)' }}>{fmtJst(m.updated_at)}</b>
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
        <Link to="/terms" style={{ color: 'var(--muted)' }}>
          利用規約
        </Link>
        <span style={{ margin: '0 8px' }}>·</span>
        <span>© 2026 rou39</span>
      </footer>
    </main>
  );
}
