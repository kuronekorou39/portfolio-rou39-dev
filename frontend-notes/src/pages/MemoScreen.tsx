import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, type MemoData } from '../lib/api';

/**
 * メモ画面(秘密URL専用・ログイン不要)。
 *
 * トークンは URL フラグメント(#以降)にのみ載る。フラグメントはサーバ・Referer・
 * アクセスログのいずれにも送信されない。API へは POST の body でのみ渡す。
 *
 * 【重要】このファイル(と、ここから import されるもの)は lib/auth や
 * amazon-cognito-identity-js を import してはならない。メモ画面のチャンクに
 * 認証系コードを混入させない(攻撃面と初期表示サイズを増やさない)ため。
 *
 * P2 は読み取り表示まで。編集・自動保存・タブ追加は P3 で実装する。
 */
export default function MemoScreen() {
  const token = useMemo(() => window.location.hash.slice(1), []);
  const [data, setData] = useState<MemoData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [activeTab, setActiveTab] = useState(0);

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

  const tab = data.tabs[activeTab] ?? data.tabs[0];

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
      <header style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 16, margin: 0, color: 'var(--muted)', fontWeight: 500 }}>
          {data.memo.title || 'メモ'}
        </h1>
      </header>

      {/* タブバー(P2 は切り替えのみ。追加/削除は P3) */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: '1px solid var(--border)',
          overflowX: 'auto',
        }}
      >
        {data.tabs.map((t, i) => (
          <button
            key={t.tab_id}
            onClick={() => setActiveTab(i)}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              border: 'none',
              borderBottom: i === activeTab ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'transparent',
              color: i === activeTab ? 'var(--fg)' : 'var(--muted)',
              whiteSpace: 'nowrap',
            }}
          >
            {t.title || `タブ ${i + 1}`}
          </button>
        ))}
      </div>

      {/* 本文(P2 は読み取り表示。textContent 描画で HTML 解釈は一切しない) */}
      <div
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: 15,
          padding: '16px 4px',
          minHeight: '50dvh',
        }}
      >
        {tab?.content || (
          <span style={{ color: 'var(--muted)' }}>
            (まだ何も書かれていません。編集機能は近日追加)
          </span>
        )}
      </div>
    </main>
  );
}
