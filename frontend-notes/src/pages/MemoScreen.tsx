import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, PIN_MIN_LEN, type AccessLogEntry, type MemoData } from '../lib/api';
import {
  useAutosave,
  lastTabKey,
  seenIpsKey,
  MAX_TABS_PER_MEMO,
  type TabState,
} from '../lib/autosave';
import { saveSnapshot, loadSnapshot, deleteSnapshot } from '../lib/offline';
import ThemeToggle from '../components/ThemeToggle';
import Loading from '../components/Loading';

/** User-Agent を「OS / ブラウザ」に要約する。全文はクリックで開ける。 */
function shortUa(ua: string): string {
  if (!ua) return '不明';
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux|X11/.test(ua)
            ? 'Linux'
            : null;
  // 判定順が重要。Edge/Opera は Chrome を、Chrome は Safari を UA に含む
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /CriOS\//.test(ua)
        ? 'Chrome'
        : /Firefox\/|FxiOS\//.test(ua)
          ? 'Firefox'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : null;
  if (os && browser) return `${os} / ${browser}`;
  if (os) return os;
  if (browser) return browser;
  return ua.length > 40 ? `${ua.slice(0, 40)}…` : ua; // bot 等
}

/** アクセス元の識別子。生IPが無い古い記録はハッシュで代用する。 */
const ipOf = (e: AccessLogEntry) => e.ip || e.ip_hash;

function readSeenIps(memoId: string | undefined): Set<string> {
  if (!memoId) return new Set();
  try {
    const raw = localStorage.getItem(seenIpsKey(memoId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/**
 * アクセス履歴(直近)。E2E暗号化しない代わりに「誰がいつ開いたか」を利用者に見せる。
 *
 * 「新規」= この端末でまだ確認していないアクセス元(localStorage にメモ単位で記録)。
 * サーバ側に初回フラグを持たせると閲覧記録のたびに過去ログを引くことになるので、
 * 端末側で持つ。別の端末で開くと一度は全部が新規に見える。
 */
function AccessLogPanel({ entries, memoId }: { entries: AccessLogEntry[]; memoId?: string }) {
  // 確認済みIPはマウント時に読む。開いている間に消えないよう、状態としても保持する
  const [seen, setSeen] = useState<Set<string>>(() => readSeenIps(memoId));
  const [expandedUa, setExpandedUa] = useState<number | null>(null);

  const newIps = useMemo(() => {
    const s = new Set<string>();
    for (const e of entries) if (!seen.has(ipOf(e))) s.add(ipOf(e));
    return s;
  }, [entries, seen]);

  // 閉じたタイミングで既読にする(開いている間はハイライトを残して見えるようにする)
  const acknowledge = useCallback(() => {
    if (!memoId || newIps.size === 0) return;
    const next = new Set([...seen, ...newIps]);
    setSeen(next);
    try {
      localStorage.setItem(seenIpsKey(memoId), JSON.stringify([...next]));
    } catch {
      /* 容量超過等。ハイライトが出続けるだけで実害はない */
    }
  }, [memoId, newIps, seen]);

  if (entries.length === 0) return null;

  return (
    <details
      style={{ marginTop: 24, fontSize: 12, color: 'var(--muted)' }}
      onToggle={(e) => {
        if (!(e.currentTarget as HTMLDetailsElement).open) acknowledge();
      }}
    >
      <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
        アクセス履歴(直近 {entries.length} 件)
        {/* 閉じたままでも新規アクセスに気づけるようにバッジを出す */}
        {newIps.size > 0 && (
          <span
            style={{
              marginLeft: 8,
              padding: '1px 7px',
              borderRadius: 999,
              background: 'var(--danger)',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            新規 {newIps.size}
          </span>
        )}
      </summary>
      <ul style={{ listStyle: 'none', padding: '8px 0 0', margin: 0 }}>
        {entries.map((e, i) => {
          const isNew = newIps.has(ipOf(e));
          return (
            <li
              key={i}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'baseline',
                flexWrap: 'wrap',
                padding: '4px 6px',
                borderBottom: '1px solid var(--border)',
                background: isNew ? 'color-mix(in srgb, var(--danger) 12%, transparent)' : undefined,
                borderRadius: isNew ? 4 : undefined,
              }}
            >
              <span style={{ flexShrink: 0 }}>
                {new Date(e.ts).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  flexShrink: 0,
                  fontWeight: isNew ? 700 : undefined,
                  color: isNew ? 'var(--danger)' : undefined,
                }}
                title="アクセス元のIPアドレス"
              >
                {ipOf(e)}
                {isNew && ' ●'}
              </span>
              <button
                onClick={() => setExpandedUa(expandedUa === i ? null : i)}
                title="クリックで端末情報の全文"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--muted)',
                  font: 'inherit',
                  cursor: 'pointer',
                  padding: 0,
                  textAlign: 'left',
                  textDecoration: 'underline dotted',
                }}
              >
                {expandedUa === i ? e.ua || '不明' : shortUa(e.ua)}
              </button>
            </li>
          );
        })}
      </ul>
      <p style={{ margin: '8px 0 0' }}>
        ※ このURLを開いたアクセスの記録です(10分内の連続アクセスは1件にまとめられます)。
        アクセス元のIPアドレスと端末情報を記録し、90日で自動削除されます。
        <br />
        ※「新規」はこの端末でまだ確認していないアクセス元です(閉じると確認済みになります)。
      </p>
    </details>
  );
}

/**
 * メモ画面(ログイン不要=一般利用者が見る唯一の公開面)のフッタ。
 * ポリシー/規約と、濫用コンテンツの通報導線を最小限で置く(運営への到達手段)。
 * 認証系は import しない方針のため、react-router ではなく素の <a> でSPAへ遷移する。
 */
function MemoFooter() {
  const link: React.CSSProperties = { color: 'var(--muted)' };
  return (
    <footer
      style={{
        marginTop: 28,
        paddingTop: 14,
        borderTop: '1px solid var(--border)',
        fontSize: 12,
        color: 'var(--muted)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px 12px',
        alignItems: 'center',
      }}
    >
      <a href="/privacy" style={link}>プライバシーポリシー</a>
      <a href="/terms" style={link}>利用規約</a>
      <span>
        違法・不適切なメモの通報:{' '}
        <a href="mailto:contact@rou39.com" style={link}>contact@rou39.com</a>
      </span>
      <span style={{ marginLeft: 'auto' }}>Stash Notes</span>
    </footer>
  );
}

/**
 * メモ画面(秘密URL専用・ログイン不要)。
 *
 * トークンは URL フラグメント(#以降)にのみ載る。フラグメントはサーバ・Referer・
 * アクセスログのいずれにも送信されない。API へは POST の body でのみ渡す。
 *
 * 【重要】このファイル(と、ここから import されるもの)は lib/auth や
 * amazon-cognito-identity-js を import してはならない。メモ画面のチャンクに
 * 認証系コードを混入させない(攻撃面と初期表示サイズを増やさない)ため。
 */

function saveLabel(tab: TabState | undefined): { text: string; color: string } {
  if (!tab) return { text: '', color: 'var(--muted)' };
  switch (tab.save) {
    case 'conflict':
      return { text: '競合あり', color: 'var(--danger)' };
    case 'too_large':
      return { text: '容量超過(60KB)', color: 'var(--danger)' };
    case 'saving':
      return { text: '保存中…', color: 'var(--muted)' };
    case 'retrying':
      return { text: '再試行中…', color: 'var(--danger)' };
    case 'revoked':
      return { text: 'URLが無効', color: 'var(--danger)' };
    case 'auth':
      return { text: 'PINが変更', color: 'var(--danger)' };
    case 'create_failed':
      return { text: 'タブ未作成', color: 'var(--danger)' };
    default:
      return tab.dirty ? { text: '未保存', color: 'var(--muted)' } : { text: '保存済み', color: 'var(--muted)' };
  }
}

const MAX_TABS = MAX_TABS_PER_MEMO;

/** 空行に1行分の高さを持たせるための埋め草。幅ゼロなので折り返しに影響しない。 */
const ZERO_WIDTH_SPACE = '\u200b';

/**
 * 末尾の「改行だけの行」の開始行番号を返す(該当なしなら -1)。
 * 最後に文字がある行より下の空行を、まとめてハイライトするために使う。
 */
function trailingBlankFrom(text: string): number {
  const lines = text.split('\n');
  let last = lines.length - 1;
  while (last >= 0 && lines[last].trim() === '') last--;
  return last === lines.length - 1 ? -1 : last + 1;
}

/**
 * 本文エディタ。textarea は行単位で装飾できないので、同じテキストを描画した層を
 * 背後に重ねて、末尾の空行だけ背景を付ける。
 * 見た目がずれないよう、フォント・行間・パディング・折り返し規則を両者で共有する。
 */
function ContentEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => value.split('\n'), [value]);
  const blankFrom = useMemo(() => trailingBlankFrom(value), [value]);

  // textarea と背面レイヤで必ず一致させる必要があるスタイル
  const shared: React.CSSProperties = {
    fontSize: 15,
    lineHeight: 1.8,
    fontFamily: 'inherit',
    padding: '4px',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    wordBreak: 'break-word',
    letterSpacing: 'normal',
    tabSize: 4,
    border: 'none',
    margin: 0,
    // textarea 側にスクロールバーが出ると内容幅が縮み、背面レイヤと折り返し位置がずれる。
    // 両方で溝を常に確保して幅を揃える(オーバーレイ型スクロールバーの環境では元々ずれない)。
    scrollbarGutter: 'stable',
  };

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: '55dvh', display: 'flex' }}>
      <div
        ref={overlayRef}
        aria-hidden
        style={{
          ...shared,
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
          color: 'transparent',
        }}
      >
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              background:
                blankFrom >= 0 && i >= blankFrom
                  ? 'color-mix(in srgb, var(--fg) 7%, transparent)'
                  : 'transparent',
            }}
          >
            {/* 空行にも1行分の高さを持たせる(ゼロ幅スペースなので折り返しに影響しない) */}
            {line === '' ? ZERO_WIDTH_SPACE : line}
          </div>
        ))}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          // 背面レイヤを textarea のスクロールに追従させる
          if (overlayRef.current) overlayRef.current.scrollTop = e.currentTarget.scrollTop;
        }}
        placeholder="ここに入力すると自動保存されます"
        style={{
          ...shared,
          position: 'relative',
          flex: 1,
          width: '100%',
          outline: 'none',
          resize: 'none',
          background: 'transparent',
        }}
      />
    </div>
  );
}

function Editor({
  token,
  data,
  offlineAt,
  pin,
}: {
  token: string;
  data: MemoData;
  /** オフライン表示中なら、そのスナップショットの最終同期時刻(epoch ms)。 */
  offlineAt: number | null;
  /** PIN 保護メモの場合の PIN(書き込みに同送)。 */
  pin?: string;
}) {
  const { tabs, edit, saveNow, adoptServer, overwriteServer, addTab, retryCreate, removeTab, reorder, latest } =
    useAutosave(token, data.tabs, pin);
  const memoId = data.memo.memo_id;
  // 前回このメモで見ていたタブを復元する(無ければ先頭)
  const [activeId, setActiveId] = useState<string>(() => {
    const remembered = memoId ? localStorage.getItem(lastTabKey(memoId)) : null;
    return remembered && data.tabs.some((t) => t.tab_id === remembered)
      ? remembered
      : (data.tabs[0]?.tab_id ?? '');
  });
  const [tabError, setTabError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const active = tabs.find((t) => t.tab_id === activeId) ?? tabs[0];

  // 表示中のタブを覚えておく。トークンは保存しない(メモIDとタブIDだけ)
  useEffect(() => {
    if (!memoId || !active) return;
    try {
      localStorage.setItem(lastTabKey(memoId), active.tab_id);
    } catch {
      /* 容量超過等。次回先頭に戻るだけ */
    }
  }, [memoId, active]);

  const switchTab = (id: string) => {
    // タブ切替時は前のタブを即時保存(debounce を待たない)
    if (active && active.dirty) void saveNow(active.tab_id);
    setActiveId(id);
  };

  // + は即座にタブを出す。サーバ作成は裏で走り、失敗したらそのタブに理由が出る
  const onAddTab = () => {
    setTabError(null);
    const id = addTab();
    if (!id) {
      setTabError(`タブは最大 ${MAX_TABS} 枚までです`);
      return;
    }
    setActiveId(id);
  };

  /** ドラッグ中のタブを、対象タブの位置へ差し込む。 */
  const onDropTab = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = tabs.map((t) => t.tab_id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    setTabError(null);
    void reorder(ids).then((okReordered) => {
      if (!okReordered) setTabError('並び順を保存できませんでした。次回開いたときは元の順序に戻ります');
    });
  };

  const onRemoveTab = async (id: string) => {
    const t = tabs.find((x) => x.tab_id === id);
    if (!t) return;
    const hasText = t.content.trim().length > 0;
    if (hasText && !window.confirm('このタブを削除しますか?(元に戻せません)')) return;
    setTabError(null);
    const okDeleted = await removeTab(id);
    if (!okDeleted) {
      setTabError('タブを削除できませんでした。時間をおいて再試行してください');
      return;
    }
    if (activeId === id) {
      const rest = tabs.filter((x) => x.tab_id !== id);
      setActiveId(rest[0]?.tab_id ?? '');
    }
  };

  const indicator = saveLabel(active);

  return (
    <main
      style={{
        maxWidth: 860,
        margin: '0 auto',
        padding: '16px 16px 48px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100dvh',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 12,
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{data.memo.title || 'メモ'}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: indicator.color }}>{indicator.text}</span>
          <ThemeToggle />
        </span>
      </header>

      {/* タブバー(横スクロールではなく折り返しで全タブを見せる) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
          borderBottom: '1px solid var(--border)',
        }}
      >
        {tabs.map((t, i) => (
          <div
            key={t.tab_id}
            style={{
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
              opacity: dragId === t.tab_id ? 0.4 : 1,
            }}
            // 並べ替え: つかんで別のタブの上に落とすとそこへ差し込む
            draggable
            onDragStart={() => setDragId(t.tab_id)}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => {
              if (dragId && dragId !== t.tab_id) e.preventDefault(); // ドロップを許可
            }}
            onDrop={(e) => {
              e.preventDefault();
              onDropTab(t.tab_id);
              setDragId(null);
            }}
          >
            <button
              onClick={() => switchTab(t.tab_id)}
              style={{
                padding: '8px 10px 8px 14px',
                fontSize: 13,
                border: 'none',
                borderBottom:
                  t.tab_id === active?.tab_id
                    ? '2px solid var(--accent)'
                    : '2px solid transparent',
                background: 'transparent',
                color: t.tab_id === active?.tab_id ? 'var(--fg)' : 'var(--muted)',
                whiteSpace: 'nowrap',
                cursor: dragId ? 'grabbing' : 'grab',
              }}
              title="ドラッグで並べ替え"
            >
              {t.title || `タブ ${i + 1}`}
              {t.save === 'create_failed' ? ' ⚠' : t.dirty ? ' •' : ''}
            </button>
            {tabs.length > 1 && t.tab_id === active?.tab_id && (
              <button
                onClick={() => void onRemoveTab(t.tab_id)}
                title="このタブを削除"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--muted)',
                  fontSize: 12,
                  padding: '4px 6px',
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {tabs.length < MAX_TABS && (
          <button
            onClick={onAddTab}
            title="タブを追加"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--accent)',
              fontSize: 16,
              padding: '4px 10px',
              flexShrink: 0,
              cursor: 'pointer',
            }}
          >
            +
          </button>
        )}
      </div>

      {offlineAt !== null && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--muted)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '6px 10px',
            margin: '10px 0 0',
          }}
        >
          オフライン表示中(最終同期:{' '}
          {new Date(offlineAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })})。
          編集はこの端末に保存され、接続が戻ると自動で同期されます。
        </p>
      )}

      {tabError && (
        <p style={{ fontSize: 13, color: 'var(--danger)', margin: '8px 0 0' }}>{tabError}</p>
      )}

      {/* 競合調停バナー */}
      {active?.save === 'conflict' && active.conflictCurrent && (
        <div
          style={{
            border: '1px solid var(--danger)',
            borderRadius: 6,
            padding: '10px 14px',
            margin: '12px 0 0',
            fontSize: 13,
          }}
        >
          <p style={{ margin: '0 0 8px', color: 'var(--danger)' }}>
            別の画面(端末)がこのタブを先に保存しています。どちらを残しますか?
            どちらを選んでも、いま画面にある文章が黙って消えることはありません。
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => overwriteServer(active.tab_id)}
              style={{
                padding: '6px 14px',
                border: '1px solid var(--accent)',
                color: 'var(--accent)',
                background: 'var(--surface)',
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              この画面の内容で上書き
            </button>
            <button
              onClick={() => adoptServer(active.tab_id)}
              style={{
                padding: '6px 14px',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              保存済みの内容を読み込む(この画面の編集は破棄)
            </button>
          </div>
        </div>
      )}

      {active?.save === 'too_large' && (
        <p style={{ fontSize: 13, color: 'var(--danger)', margin: '12px 0 0' }}>
          このタブが上限(60KB)を超えたため保存できません。文章を減らすか、新しいタブに分割してください。
        </p>
      )}

      {/* タブ自体をサーバに作れなかった。入力内容は残っているので、作り直しを促す。 */}
      {active?.save === 'create_failed' && (
        <div
          role="alert"
          style={{
            border: '1px solid var(--danger)',
            borderRadius: 6,
            padding: '10px 14px',
            margin: '12px 0 0',
            fontSize: 13,
            color: 'var(--danger)',
          }}
        >
          {active.createError === 'tab_limit_reached'
            ? `タブは最大 ${MAX_TABS} 枚までです。このタブはサーバに作成されていません。`
            : 'このタブをサーバに作成できませんでした。入力内容はこの画面に残っています。'}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {active.createError !== 'tab_limit_reached' && (
              <button
                onClick={() => retryCreate(active.tab_id)}
                style={{
                  padding: '6px 14px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                もう一度作成する
              </button>
            )}
            <button
              onClick={() => void onRemoveTab(active.tab_id)}
              style={{
                padding: '6px 14px',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              このタブを捨てる
            </button>
          </div>
        </div>
      )}

      {/* 終端状態(これ以上保存できない)。無限リトライさせず、復旧方法を案内する。 */}
      {(active?.save === 'revoked' || active?.save === 'auth') && (
        <div
          role="alert"
          style={{
            border: '1px solid var(--danger)',
            borderRadius: 6,
            padding: '10px 14px',
            margin: '12px 0 0',
            fontSize: 13,
            color: 'var(--danger)',
          }}
        >
          {active.save === 'auth'
            ? 'このメモの PIN が変更されたため、これ以上保存できません。ページを再読み込みし、新しい PIN で開き直してください。'
            : 'この URL は無効化(または期限切れ)になったため、これ以上保存できません。発行者に新しい URL を確認してください。'}
          <br />
          いま画面にある未保存の編集はこの端末に残っているので、開き直せば復旧できます。
        </div>
      )}

      {/* タブ名 + 本文 */}
      {active && (
        <>
          <input
            value={active.title}
            onChange={(e) => edit(active.tab_id, { title: e.target.value })}
            placeholder="タブ名(任意)"
            maxLength={200}
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 15,
              fontWeight: 600,
              padding: '12px 4px 4px',
            }}
          />
          <ContentEditor
            value={active.content}
            onChange={(v) => edit(active.tab_id, { content: v })}
          />
        </>
      )}

      {/* アクセス履歴は同期で取り直した最新版を優先する */}
      <AccessLogPanel entries={latest?.access_log ?? data.access_log ?? []} memoId={memoId} />
      <MemoFooter />
    </main>
  );
}

/** 読み取り専用URLで開いたときのビュー(閲覧のみ・編集不可・アクセス履歴も非表示)。 */
function ReadonlyView({ data, offlineAt }: { data: MemoData; offlineAt: number | null }) {
  const tabs = data.tabs;
  const [activeId, setActiveId] = useState<string>(tabs[0]?.tab_id ?? '');
  const active = tabs.find((t) => t.tab_id === activeId) ?? tabs[0];

  return (
    <main
      style={{
        maxWidth: 860,
        margin: '0 auto',
        padding: '16px 16px 48px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100dvh',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{data.memo.title || 'メモ'}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontSize: 12,
              color: 'var(--muted)',
              border: '1px solid var(--border)',
              borderRadius: 99,
              padding: '2px 10px',
            }}
          >
            読み取り専用
          </span>
          <ThemeToggle />
        </span>
      </header>

      {offlineAt !== null && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--muted)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '6px 10px',
            margin: '0 0 8px',
          }}
        >
          オフライン表示中(最終同期:{' '}
          {new Date(offlineAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })})
        </p>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
          borderBottom: '1px solid var(--border)',
        }}
      >
        {tabs.map((t, i) => (
          <button
            key={t.tab_id}
            onClick={() => setActiveId(t.tab_id)}
            style={{
              padding: '8px 14px',
              fontSize: 13,
              border: 'none',
              borderBottom:
                t.tab_id === active?.tab_id ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'transparent',
              color: t.tab_id === active?.tab_id ? 'var(--fg)' : 'var(--muted)',
              whiteSpace: 'nowrap',
            }}
          >
            {t.title || `タブ ${i + 1}`}
          </button>
        ))}
      </div>

      {active?.title && (
        <div style={{ fontSize: 15, fontWeight: 600, padding: '12px 4px 0' }}>{active.title}</div>
      )}
      {/* 本文は必ずテキストノードとして描画(HTML 解釈しない) */}
      <div
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: 15,
          lineHeight: 1.8,
          padding: '8px 4px',
          flex: 1,
          minHeight: '55dvh',
        }}
      >
        {active?.content || <span style={{ color: 'var(--muted)' }}>(空のタブ)</span>}
      </div>
      <MemoFooter />
    </main>
  );
}

/** PIN 入力フォーム(PIN 保護されたメモを開くとき)。 */
function PinGate({
  onSubmit,
  error,
  locked,
}: {
  onSubmit: (pin: string) => void;
  error: boolean;
  locked: boolean;
}) {
  const [pin, setPin] = useState('');
  return (
    <main style={{ maxWidth: 360, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>PIN を入力</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 24 }}>
        このメモは PIN で保護されています。
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pin) onSubmit(pin);
        }}
      >
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={64}
          disabled={locked}
          placeholder="••••"
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: 18,
            letterSpacing: 6,
            textAlign: 'center',
            border: '1px solid var(--border)',
            borderRadius: 8,
            marginBottom: 12,
          }}
        />
        <button
          type="submit"
          disabled={locked || pin.length < PIN_MIN_LEN}
          style={{
            width: '100%',
            padding: '10px',
            fontSize: 15,
            border: 'none',
            borderRadius: 8,
            background: 'var(--accent)',
            color: 'var(--accent-fg)',
            opacity: locked || pin.length < PIN_MIN_LEN ? 0.5 : 1,
          }}
        >
          開く
        </button>
      </form>
      {error && !locked && (
        <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>
          PIN が違います。もう一度お試しください。
        </p>
      )}
      {locked && (
        <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>
          試行回数が上限に達しました。しばらく待ってから再度お試しください。
        </p>
      )}
    </main>
  );
}

export default function MemoScreen() {
  const token = useMemo(() => window.location.hash.slice(1), []);
  const [data, setData] = useState<MemoData | null>(null);
  const [state, setState] = useState<
    'loading' | 'ready' | 'unavailable' | 'error' | 'pin' | 'pin_error' | 'pin_locked'
  >('loading');
  const [offlineAt, setOfflineAt] = useState<number | null>(null);
  const [pin, setPin] = useState<string | undefined>(undefined);

  // メモ画面のみ Service Worker を登録(scope /m。管理画面は制御下に置かない)。
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/m' }).catch(() => {
        /* SW 不可でもオンライン動作には影響しない */
      });
    }
  }, []);

  const load = useCallback(
    async (tryPin?: string) => {
      if (!token) {
        setState('unavailable');
        return;
      }
      try {
        const d = await api.getMemo(token, tryPin);
        setData(d);
        setPin(tryPin);
        setState('ready');
        void saveSnapshot(token, d).catch(() => {});
      } catch (e) {
        if (e instanceof ApiError) {
          if (e.status === 404) {
            void deleteSnapshot(token).catch(() => {});
            setState('unavailable');
            return;
          }
          // PIN 保護: 未提示/誤り(401)・ロック(429)
          if (e.status === 401) {
            setState(tryPin ? 'pin_error' : 'pin');
            return;
          }
          if (e.status === 429 && e.code === 'pin_locked') {
            setState('pin_locked');
            return;
          }
        }
        // ネットワーク断・サーバ障害 → オフラインスナップショットにフォールバック
        const snap = await loadSnapshot(token).catch(() => null);
        if (snap) {
          setData(snap.data);
          setPin(tryPin);
          setOfflineAt(snap.savedAt);
          setState('ready');
        } else {
          setState('error');
        }
      }
    },
    [token],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (state === 'pin' || state === 'pin_error' || state === 'pin_locked') {
    return (
      <PinGate
        onSubmit={(p) => void load(p)}
        error={state === 'pin_error'}
        locked={state === 'pin_locked'}
      />
    );
  }

  if (state === 'loading') {
    return <Loading />;
  }

  if (state === 'unavailable') {
    return (
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 20 }}>このメモは利用できません</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          URL が正しくないか、無効化されています。発行者に新しいURLを確認してください。
        </p>
      </main>
    );
  }

  if (state === 'error' || !data) {
    return (
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 20 }}>読み込みに失敗しました</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          通信状態を確認して、再読み込みしてください。
        </p>
      </main>
    );
  }

  // 読み取り専用URL(mode='ro')は閲覧ビュー。編集エンジンは起動しない
  if (data.mode === 'ro') return <ReadonlyView data={data} offlineAt={offlineAt} />;
  return <Editor token={token} data={data} offlineAt={offlineAt} pin={pin} />;
}
