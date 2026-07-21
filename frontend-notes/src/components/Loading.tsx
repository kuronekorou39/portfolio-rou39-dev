import type { CSSProperties } from 'react';

/**
 * ローディング表示の共通部品。アプリ全体の「読み込み中」はすべてこれを使う。
 * アニメーションを差し替えたいときは、下の Dots だけ書き換えれば全箇所に反映される
 * (キーフレーム notes-loading-pulse は index.css。prefers-reduced-motion も同所で尊重)。
 */

// ▼▼▼ 差し替えポイント: ここ(Dots)を自作アニメーションに置き換える ▼▼▼
function Dots() {
  const dot: CSSProperties = {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'currentColor',
    display: 'inline-block',
    animation: 'notes-loading-pulse 1s ease-in-out infinite',
  };
  return (
    <span data-notes-loading style={{ display: 'inline-flex', gap: 6 }} aria-hidden="true">
      <span style={{ ...dot, animationDelay: '0s' }} />
      <span style={{ ...dot, animationDelay: '0.15s' }} />
      <span style={{ ...dot, animationDelay: '0.3s' }} />
    </span>
  );
}
// ▲▲▲ 差し替えポイントここまで ▲▲▲

export default function Loading({
  label = '読み込み中…',
  block = true,
}: {
  /** 付随テキスト。空文字にするとアニメーションのみ。 */
  label?: string;
  /** true=画面中央に余白付きで配置、false=その場にインライン配置。 */
  block?: boolean;
}) {
  const inner = (
    <span
      role="status"
      aria-live="polite"
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        color: 'var(--muted)',
      }}
    >
      <Dots />
      {label && <span style={{ fontSize: 13 }}>{label}</span>}
    </span>
  );
  if (!block) return inner;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '96px 24px' }}>{inner}</div>
  );
}
