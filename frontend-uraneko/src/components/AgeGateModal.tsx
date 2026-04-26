import { useAgeGate } from '../contexts/AgeGateContext';

export default function AgeGateModal() {
  const { confirmed, confirm, deny } = useAgeGate();
  if (confirmed) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse at 50% 40%, #4a0f1a 0%, #2a0811 35%, #160608 70%, #060203 100%)',
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
            'radial-gradient(ellipse, rgba(201,169,97,0.25) 0%, transparent 60%)',
        }}
      />

      {/* 上下のラベル */}
      <div
        className="absolute left-[60px] right-[60px] top-7 flex justify-between"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: 4,
          color: 'var(--dim)',
        }}
      >
        <span>EST. 令和八年 · URANEKO · ROU39</span>
        <span>MEMBERS ONLY · R—18</span>
      </div>

      {/* 中央の真鍮額縁 */}
      <div className="absolute left-1/2 top-1/2 w-[520px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 text-center">
        <div
          className="relative"
          style={{
            padding: '56px 48px',
            border: '1px solid rgba(201,169,97,0.7)',
            background: 'rgba(10,5,3,0.35)',
            backdropFilter: 'blur(4px)',
          }}
        >
          {/* 内側の二重枠 */}
          <div
            className="pointer-events-none absolute"
            style={{
              inset: 8,
              border: '1px solid rgba(201,169,97,0.3)',
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
            — 御入店 · ENTRANCE —
          </div>

          <div
            style={{
              fontFamily: 'var(--font-serif-jp)',
              fontSize: 56,
              fontWeight: 200,
              letterSpacing: 14,
              color: 'var(--color-fg)',
              lineHeight: 1,
            }}
          >
            uraneko
          </div>
          <div
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: 16,
              letterSpacing: 6,
              color: 'var(--color-gold-bright)',
              marginTop: 14,
              fontWeight: 300,
            }}
          >
            URA · NEKO
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
            本サイトはアダルトコンテンツを含みます。
            <br />
            閲覧には 18 歳以上であることが必要です。
          </p>
          <p
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: 12,
              lineHeight: 1.8,
              color: 'var(--dim)',
              letterSpacing: 1.5,
              marginBottom: 36,
            }}
          >
            This site is for verified adults only.
          </p>

          <div className="flex gap-3">
            <button
              onClick={deny}
              style={{
                flex: 1,
                padding: '12px 18px',
                fontFamily: 'var(--font-serif)',
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: 5,
                color: 'var(--color-gold)',
                background: 'transparent',
                border: '1px solid rgba(201,169,97,0.6)',
                cursor: 'pointer',
                transition: 'background 150ms',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = 'rgba(201,169,97,0.08)')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = 'transparent')
              }
            >
              退出
            </button>
            <button
              onClick={confirm}
              style={{
                flex: 1.3,
                padding: '12px 18px',
                fontFamily: 'var(--font-serif)',
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: 7,
                color: '#120808',
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
              ENTER · 入店する
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
