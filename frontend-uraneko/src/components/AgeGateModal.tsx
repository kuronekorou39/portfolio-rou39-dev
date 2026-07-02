import { useAgeGate } from '../contexts/AgeGateContext';

export default function AgeGateModal() {
  const { confirmed, confirm, deny } = useAgeGate();
  if (confirmed) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse at 50% 40%, #17171a 0%, #0e0e10 35%, #08080a 70%, #050506 100%)',
      }}
    >
      {/* 縦方向のベルベットひだ */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, rgba(0,0,0,0.22) 0 1px, transparent 1px 40px), repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 80px)',
          mixBlendMode: 'overlay',
        }}
      />

      {/* 暖色ダウンライト */}
      <div
        className="pointer-events-none absolute left-1/2 h-[500px] w-[900px] -translate-x-1/2"
        style={{
          top: -200,
          background:
            'radial-gradient(ellipse, rgba(168,166,158,0.25) 0%, transparent 60%)',
        }}
      />

      {/* 上下のラベル */}
      <div
        className="absolute left-4 right-4 top-7 flex flex-wrap justify-between gap-x-4 gap-y-1 sm:left-[60px] sm:right-[60px]"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: 4,
          color: 'var(--dim)',
        }}
      >
        <span>uraneko — private archive</span>
        <span style={{ color: 'var(--color-accent)' }}>18+ only</span>
      </div>

      {/* 中央の真鍮額縁 */}
      <div className="absolute left-1/2 top-1/2 w-[520px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 text-center">
        <div
          className="relative"
          style={{
            padding: 'clamp(32px, 8vw, 56px) clamp(20px, 6vw, 48px)',
            border: '1px solid rgba(168,166,158,0.7)',
            background: 'rgba(10,5,3,0.35)',
            backdropFilter: 'blur(4px)',
          }}
        >
          {/* 内側の二重枠 */}
          <div
            className="pointer-events-none absolute"
            style={{
              inset: 8,
              border: '1px solid rgba(168,166,158,0.3)',
            }}
          />
          {/* 四隅のダイヤ */}
          <div className="brass-diamond" style={{ top: -3, left: -3 }} />
          <div className="brass-diamond" style={{ top: -3, right: -3 }} />
          <div className="brass-diamond" style={{ bottom: -3, left: -3 }} />
          <div className="brass-diamond" style={{ bottom: -3, right: -3 }} />

          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: 8,
              color: 'var(--color-gold)',
              marginBottom: 28,
            }}
          >
            — ACCESS —
          </div>

          <div
            style={{
              fontFamily: 'var(--font-serif-jp)',
              fontSize: 'clamp(36px, 10vw, 56px)',
              fontWeight: 200,
              letterSpacing: 'clamp(6px, 2.5vw, 14px)',
              color: 'var(--color-fg)',
              lineHeight: 1,
            }}
          >
            uraneko
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: 6,
              color: 'var(--color-gold-bright)',
              marginTop: 14,
              fontWeight: 300,
            }}
          >
            private archive
          </div>

          {/* 装飾区切り */}
          <div
            className="mx-auto my-7 flex max-w-[220px] items-center gap-3.5"
            style={{ color: 'var(--color-gold)' }}
          >
            <div className="brass-hairline flex-1" />
            <div style={{ fontSize: 10, opacity: 0.8 }}>❖</div>
            <div className="brass-hairline flex-1" />
          </div>

          <p
            style={{
              fontFamily: 'var(--font-serif-jp)',
              fontSize: 14,
              lineHeight: 2,
              color: 'var(--muted)',
              fontWeight: 300,
              marginBottom: 8,
            }}
          >
            成人向けの映像アーカイブ。
            <br />
            18歳未満は閲覧できません。
          </p>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              lineHeight: 1.8,
              color: 'var(--dim)',
              letterSpacing: 2,
              marginBottom: 36,
            }}
          >
            18+ only. no exceptions.
          </p>

          <div className="flex gap-3">
            <button
              onClick={deny}
              style={{
                flex: 1,
                padding: '12px 18px',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: 3,
                color: 'var(--color-gold)',
                background: 'transparent',
                border: '1px solid rgba(168,166,158,0.6)',
                cursor: 'pointer',
                transition: 'background 150ms',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = 'rgba(168,166,158,0.08)')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = 'transparent')
              }
            >
              閉じる
            </button>
            <button
              onClick={confirm}
              style={{
                flex: 1.3,
                padding: '12px 18px',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: 3,
                color: '#0a0a0b',
                background: 'var(--color-gold)',
                border: '1px solid var(--color-gold)',
                cursor: 'pointer',
                transition: 'background 150ms',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = 'var(--color-gold-bright)')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = 'var(--color-gold)')
              }
            >
              18歳以上 — 入る
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
