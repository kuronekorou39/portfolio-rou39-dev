import { useMemo } from 'react';

/**
 * メモ画面(秘密URL専用・ログイン不要)。
 *
 * トークンは URL フラグメント(#以降)にのみ載る。フラグメントはサーバ・Referer・
 * アクセスログのいずれにも送信されない。API へは POST の body でのみ渡す(P2 で実装)。
 *
 * 【重要】このファイル(と、ここから import されるもの)は lib/auth や
 * amazon-cognito-identity-js を import してはならない。メモ画面のチャンクに
 * 認証系コードを混入させない(攻撃面と初期表示サイズを増やさない)ため。
 */
export default function MemoScreen() {
  const token = useMemo(() => window.location.hash.slice(1), []);

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontSize: 20 }}>メモ画面(実装中)</h1>
      <p style={{ color: 'var(--muted)' }}>
        {token
          ? 'トークンを検出しました。メモの読み込み・複数タブ・自動保存は P2/P3 で実装します。'
          : 'この画面は発行済みの秘密URL(#トークン付き)からアクセスしてください。'}
      </p>
    </main>
  );
}
