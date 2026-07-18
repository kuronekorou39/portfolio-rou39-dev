import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, type AccessLogEntry, type MemoData } from '../lib/api';
import { useAutosave, type TabState } from '../lib/autosave';

/** アクセス履歴(直近)。E2E暗号化しない代わりに「誰がいつ開いたか」を利用者に見せる。 */
function AccessLogPanel({ entries }: { entries: AccessLogEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <details style={{ marginTop: 24, fontSize: 12, color: 'var(--muted)' }}>
      <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
        アクセス履歴(直近 {entries.length} 件)
      </summary>
      <ul style={{ listStyle: 'none', padding: '8px 0 0', margin: 0 }}>
        {entries.map((e, i) => (
          <li
            key={i}
            style={{
              display: 'flex',
              gap: 12,
              padding: '3px 0',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ flexShrink: 0 }}>
              {new Date(e.ts).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', flexShrink: 0 }} title="アクセス元のIPアドレス">
              {e.ip || e.ip_hash.slice(0, 8)}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {e.ua}
            </span>
          </li>
        ))}
      </ul>
      <p style={{ margin: '8px 0 0' }}>
        ※ このURLを開いたアクセスの記録です(10分内の連続アクセスは1件にまとめられます)。
        アクセス元のIPアドレスと端末情報を記録し、90日で自動削除されます。
      </p>
    </details>
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
    default:
      return tab.dirty ? { text: '未保存', color: 'var(--muted)' } : { text: '保存済み', color: 'var(--muted)' };
  }
}

// backend limits.ts の MAX_TABS_PER_MEMO と一致させる(上限に達したら+ボタン自体を出さない)
const MAX_TABS = 12;

function Editor({ token, data }: { token: string; data: MemoData }) {
  const { tabs, edit, saveNow, adoptServer, overwriteServer, addTab, removeTab } = useAutosave(
    token,
    data.tabs,
  );
  const [activeId, setActiveId] = useState<string>(data.tabs[0]?.tab_id ?? '');
  const [adding, setAdding] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);
  const active = tabs.find((t) => t.tab_id === activeId) ?? tabs[0];

  const switchTab = (id: string) => {
    // タブ切替時は前のタブを即時保存(debounce を待たない)
    if (active && active.dirty) void saveNow(active.tab_id);
    setActiveId(id);
  };

  const onAddTab = async () => {
    if (adding) return; // 連打防止(処理中は無視)
    setAdding(true);
    setTabError(null);
    const r = await addTab();
    if (r.ok) {
      setActiveId(r.tab_id);
    } else if (r.code === 'tab_limit_reached') {
      setTabError(`タブは最大 ${MAX_TABS} 枚までです`);
    } else if (r.code === 'save_throttled') {
      setTabError('操作が早すぎます。1秒ほど待ってからもう一度どうぞ');
    } else {
      setTabError('タブを追加できませんでした。時間をおいて再試行してください');
    }
    setAdding(false);
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
        <span style={{ fontSize: 12, color: indicator.color }}>{indicator.text}</span>
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
          <div key={t.tab_id} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
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
              }}
            >
              {t.title || `タブ ${i + 1}`}
              {t.dirty ? ' •' : ''}
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
            onClick={() => void onAddTab()}
            disabled={adding}
            title="タブを追加"
            style={{
              border: 'none',
              background: 'transparent',
              color: adding ? 'var(--muted)' : 'var(--accent)',
              fontSize: 16,
              padding: '4px 10px',
              flexShrink: 0,
              cursor: adding ? 'wait' : 'pointer',
            }}
          >
            {adding ? '…' : '+'}
          </button>
        )}
      </div>

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
                background: '#fff',
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
                background: '#fff',
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
          <textarea
            value={active.content}
            onChange={(e) => edit(active.tab_id, { content: e.target.value })}
            placeholder="ここに入力すると自動保存されます"
            style={{
              flex: 1,
              width: '100%',
              minHeight: '55dvh',
              border: 'none',
              outline: 'none',
              resize: 'none',
              background: 'transparent',
              fontSize: 15,
              lineHeight: 1.8,
              padding: '4px',
            }}
          />
        </>
      )}

      <AccessLogPanel entries={data.access_log ?? []} />
    </main>
  );
}

export default function MemoScreen() {
  const token = useMemo(() => window.location.hash.slice(1), []);
  const [data, setData] = useState<MemoData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');

  useEffect(() => {
    if (!token) {
      setState('unavailable');
      return;
    }
    (async () => {
      try {
        setData(await api.getMemo(token));
        setState('ready');
      } catch (e) {
        // 未知・失効・削除はサーバが一律404で返す。ここでも理由は区別して表示しない
        setState(e instanceof ApiError && e.status === 404 ? 'unavailable' : 'error');
      }
    })();
  }, [token]);

  if (state === 'loading') {
    return (
      <div style={{ textAlign: 'center', padding: '96px 24px', color: 'var(--muted)' }}>
        読み込み中…
      </div>
    );
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

  return <Editor token={token} data={data} />;
}
