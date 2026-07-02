import type { CSSProperties } from 'react';

// コールド化以前は中央にマーク(✦/❖)入りだった区切り線。現在は素の罫線のみ。
export default function Ornament({ style }: { style?: CSSProperties }) {
  return (
    <div
      style={{
        color: 'var(--color-gold)',
        ...style,
      }}
    >
      <div className="brass-hairline" />
    </div>
  );
}
