import type { ButtonHTMLAttributes, CSSProperties } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'gold' | 'outline';
  size?: 'md' | 'lg';
}

export default function BarButton({
  variant = 'gold',
  size = 'md',
  style,
  children,
  ...rest
}: Props) {
  const base: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontWeight: 500,
    letterSpacing: size === 'lg' ? 4 : 3,
    padding: size === 'lg' ? '14px 22px' : '10px 18px',
    fontSize: size === 'lg' ? 12 : 11,
    cursor: 'pointer',
    transition: 'background 150ms, color 150ms',
    border: '1px solid var(--color-gold)',
    textTransform: 'none',
  };
  const variants: Record<'gold' | 'outline', CSSProperties> = {
    gold: {
      background: 'var(--color-gold-bright)',
      color: '#0a0a0b',
    },
    outline: {
      background: 'transparent',
      color: 'var(--color-gold-bright)',
      borderColor: 'rgba(168,166,158,0.6)',
    },
  };
  return (
    <button
      {...rest}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseEnter={(e) => {
        if (variant === 'gold') e.currentTarget.style.background = 'var(--color-fg)';
        else e.currentTarget.style.background = 'rgba(168,166,158,0.08)';
        rest.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (variant === 'gold') e.currentTarget.style.background = 'var(--color-gold-bright)';
        else e.currentTarget.style.background = 'transparent';
        rest.onMouseLeave?.(e);
      }}
    >
      {children}
    </button>
  );
}
