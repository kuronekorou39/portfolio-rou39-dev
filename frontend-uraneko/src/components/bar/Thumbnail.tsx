import type { CSSProperties } from 'react';

interface Props {
  title?: string;
  subtitle?: string;
  code?: string;
  duration?: string;
  badge?: string;
  price?: string;
  artist?: string;
  ratio?: string; // e.g. "16/9" "4/5" "16/10"
  cover?: boolean;
  style?: CSSProperties;
}

/**
 * BarThumb 相当。動画サムネイル placeholder。
 * 露骨な画像は出さない方針なので、常にテキスト中央表示 + 真鍮枠の装飾。
 */
export default function Thumbnail({
  title,
  subtitle,
  code,
  duration,
  badge,
  price,
  artist,
  ratio = '16/9',
  cover = false,
  style,
}: Props) {
  return (
    <div
      style={{
        position: 'relative',
        aspectRatio: ratio,
        overflow: 'hidden',
        background:
          'radial-gradient(ellipse at 50% -10%, #1c1c20 0%, #131316 40%, #0d0d0f 75%, #060607 100%)',
        border: '1px solid rgba(168,166,158,0.3)',
        ...style,
      }}
    >
      {/* 暖色ダウンライト */}
      <div
        style={{
          position: 'absolute',
          top: -60,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '140%',
          height: 140,
          background:
            'radial-gradient(ellipse, rgba(200,198,190,0.12) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />
      {/* ベルベット織り */}
      <div className="velvet-weave pointer-events-none absolute inset-0" />
      {/* ビネット */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.55) 100%)',
          pointerEvents: 'none',
        }}
      />
      {/* 四隅の真鍮コーナー */}
      <span
        className="brass-corner"
        style={{
          top: 10,
          left: 10,
          borderTop: '1px solid var(--color-gold)',
          borderLeft: '1px solid var(--color-gold)',
        }}
      />
      <span
        className="brass-corner"
        style={{
          top: 10,
          right: 10,
          borderTop: '1px solid var(--color-gold)',
          borderRight: '1px solid var(--color-gold)',
        }}
      />
      <span
        className="brass-corner"
        style={{
          bottom: 10,
          left: 10,
          borderBottom: '1px solid var(--color-gold)',
          borderLeft: '1px solid var(--color-gold)',
        }}
      />
      <span
        className="brass-corner"
        style={{
          bottom: 10,
          right: 10,
          borderBottom: '1px solid var(--color-gold)',
          borderRight: '1px solid var(--color-gold)',
        }}
      />

      {code && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 22,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: 3,
            color: 'var(--color-gold)',
          }}
        >
          {code}
        </div>
      )}
      {badge && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 22,
            fontSize: 9,
            letterSpacing: 3,
            padding: '3px 9px',
            color: 'var(--color-gold-bright)',
            border: '1px solid rgba(168,166,158,0.6)',
            background: 'rgba(10,10,11,0.45)',
            fontFamily: 'var(--font-sans)',
            textTransform: 'uppercase',
          }}
        >
          {badge}
        </div>
      )}

      {title && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 24px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: 5,
              color: 'var(--color-gold)',
              marginBottom: 12,
              opacity: 0.8,
            }}
          >
            — {code || '○'} —
          </div>
          <div
            style={{
              fontFamily: 'var(--font-serif-jp)',
              fontSize: cover ? 36 : 18,
              fontWeight: 300,
              letterSpacing: 4,
              color: 'var(--color-fg)',
              lineHeight: 1.3,
              maxWidth: '85%',
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: cover ? 12 : 10,
                letterSpacing: 3,
                color: 'var(--muted)',
                marginTop: 10,
                fontWeight: 300,
              }}
            >
              {subtitle}
            </div>
          )}
          {artist && (
            <>
              <div
                style={{
                  width: 28,
                  height: 1,
                  background: 'var(--color-gold)',
                  opacity: 0.5,
                  margin: '14px 0',
                }}
              />
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  letterSpacing: 3,
                  color: 'var(--dim)',
                }}
              >
                {artist}
              </div>
            </>
          )}
        </div>
      )}

      {duration && (
        <div
          style={{
            position: 'absolute',
            bottom: 14,
            right: 22,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--muted)',
            letterSpacing: 1,
          }}
        >
          {duration}
        </div>
      )}
      {price && (
        <div
          style={{
            position: 'absolute',
            bottom: 14,
            left: 22,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-gold-bright)',
            letterSpacing: 2,
          }}
        >
          {price}
        </div>
      )}
    </div>
  );
}
