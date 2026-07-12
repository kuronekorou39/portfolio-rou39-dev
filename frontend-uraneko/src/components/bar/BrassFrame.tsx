import type { CSSProperties, ReactNode } from 'react';

/**
 * カード枠(旧・真鍮二重枠)。コールド化で単線の枠のみ。
 * Checkout の決済方法カード、Complete の受領証カード等で使う。
 */
export default function BrassFrame({
  children,
  padding = '40px',
  style,
  background = 'rgba(10,10,11,0.4)',
  className,
}: {
  children: ReactNode;
  padding?: string;
  style?: CSSProperties;
  background?: string;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        padding,
        border: '1px solid rgba(168,166,158,0.4)',
        background,
        ...style,
      }}
    >
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}
