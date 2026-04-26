import type { CSSProperties } from 'react';

export default function Ornament({
  mark = '✦',
  style,
}: {
  mark?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        color: 'var(--color-gold)',
        ...style,
      }}
    >
      <div className="brass-hairline" style={{ flex: 1 }} />
      <div style={{ fontSize: 10, opacity: 0.8 }}>{mark}</div>
      <div className="brass-hairline" style={{ flex: 1 }} />
    </div>
  );
}
