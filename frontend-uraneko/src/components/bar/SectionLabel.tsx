import type { CSSProperties } from 'react';

export default function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: 5,
        color: 'var(--color-gold)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
