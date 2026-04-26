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
    fontFamily: 'var(--font-serif)',
    fontWeight: 500,
    letterSpacing: size === 'lg' ? 7 : 5,
    padding: size === 'lg' ? '14px 22px' : '10px 18px',
    fontSize: size === 'lg' ? 13 : 12,
    cursor: 'pointer',
    transition: 'background 150ms, color 150ms',
    border: '1px solid var(--color-gold)',
    textTransform: 'none',
  };
  const variants: Record<'gold' | 'outline', CSSProperties> = {
    gold: {
      background: 'var(--color-gold)',
      color: '#120808',
    },
    outline: {
      background: 'transparent',
      color: 'var(--color-gold)',
      borderColor: 'rgba(201,169,97,0.6)',
    },
  };
  return (
    <button
      {...rest}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseEnter={(e) => {
        if (variant === 'gold') e.currentTarget.style.background = 'var(--color-gold-bright)';
        else e.currentTarget.style.background = 'rgba(201,169,97,0.08)';
        rest.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (variant === 'gold') e.currentTarget.style.background = 'var(--color-gold)';
        else e.currentTarget.style.background = 'transparent';
        rest.onMouseLeave?.(e);
      }}
    >
      {children}
    </button>
  );
}
