import type { CSSProperties, ReactNode } from 'react';

/**
 * 真鍮二重枠(外枠 gold70 + 内枠 gold30)、四隅にダイヤ装飾。
 * Checkout の決済方法カード、Complete の受領証カード等で使う。
 */
export default function BrassFrame({
  children,
  padding = '40px',
  style,
  background = 'rgba(10,5,3,0.35)',
}: {
  children: ReactNode;
  padding?: string;
  style?: CSSProperties;
  background?: string;
}) {
  return (
    <div
      style={{
        position: 'relative',
        padding,
        border: '1px solid rgba(201,169,97,0.7)',
        background,
        ...style,
      }}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          inset: 8,
          border: '1px solid rgba(201,169,97,0.3)',
        }}
      />
      <div className="brass-diamond" style={{ top: -3, left: -3 }} />
      <div className="brass-diamond" style={{ top: -3, right: -3 }} />
      <div className="brass-diamond" style={{ bottom: -3, left: -3 }} />
      <div className="brass-diamond" style={{ bottom: -3, right: -3 }} />
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}
