import React from 'react';
import { C, FONT_MONO, accentSoft } from '../theme';
import { withComma } from '../doc';

const SHADOW = '0 30px 70px -22px rgba(0,0,0,.7), 0 8px 24px -12px rgba(0,0,0,.6)';

/** 鍵アイコン。絵文字はレンダラ依存なので線画の SVG で描く(ランディングと同じ 24x24 / stroke 1.8) */
export const IconLock: React.FC<{ size?: number; color?: string }> = ({
  size = 24,
  color = 'currentColor',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="4" y="10.5" width="16" height="10" rx="2.5" />
    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </svg>
);

/** アドレスバーの中の URL */
export const UrlPill: React.FC<{
  url: string;
  size?: number;
  active?: boolean;
  style?: React.CSSProperties;
}> = ({ url, size = 22, active, style }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: size * 0.42,
      fontFamily: FONT_MONO,
      fontSize: size,
      color: active ? C.accent : C.muted,
      background: active ? accentSoft(0.18) : C.surface2,
      border: `1px solid ${active ? accentSoft(0.6) : C.border}`,
      borderRadius: size * 0.5,
      padding: `${size * 0.36}px ${size * 0.7}px`,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    <IconLock size={size * 0.9} color={active ? C.accent : C.muted} />
    {url}
  </span>
);

/**
 * 文字数のバッジ。値が毎フレーム変わるので、桁が増えても幅が動かないよう
 * 最終値ぶんの幅を最初から確保しておく。
 */
export const CountBadge: React.FC<{ value: number; size?: number }> = ({ value, size = 26 }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: size * 7.4,
      fontSize: size,
      fontWeight: 800,
      letterSpacing: '-0.01em',
      color: '#10151c',
      background: C.accent,
      borderRadius: 999,
      padding: `${size * 0.34}px ${size * 0.7}px`,
      whiteSpace: 'nowrap',
      boxShadow: `0 12px 30px -8px ${accentSoft(0.8)}`,
    }}
  >
    {withComma(value)} 文字
  </span>
);

/** 画面上端を走る読み込みバー。1 秒足らずで消える */
export const LoadingBar: React.FC<{ progress: number; opacity: number }> = ({
  progress,
  opacity,
}) => (
  <div
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      height: 3,
      width: `${progress * 100}%`,
      opacity,
      zIndex: 4,
      backgroundImage: `linear-gradient(90deg, ${C.accent}, ${C.accent2})`,
    }}
  />
);

/* ------------------------------------------------------------------ *
 * 端末の枠。手元の PC はノート型 / 渡す先の PC はモニタ型にして
 * 「別の端末」であることを文字なしで分からせる。
 * ------------------------------------------------------------------ */
const BrowserBar: React.FC<{ width: number; url: string; urlActive?: boolean }> = ({
  width,
  url,
  urlActive,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: `${width * 0.026}px ${width * 0.034}px`,
      borderBottom: `1px solid ${C.screenLine}`,
    }}
  >
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        style={{
          width: width * 0.019,
          height: width * 0.019,
          borderRadius: '50%',
          background: C.screenLine,
        }}
      />
    ))}
    <UrlPill url={url} size={width * 0.031} active={urlActive} style={{ marginLeft: 12 }} />
  </div>
);

const screenStyle = (width: number): React.CSSProperties => ({
  width,
  background: C.screen,
  border: `1px solid ${C.border}`,
  boxShadow: SHADOW,
  overflow: 'hidden',
  position: 'relative',
});

type DeviceProps = {
  width: number;
  url: string;
  urlActive?: boolean;
  loading?: { progress: number; opacity: number };
  children: React.ReactNode;
};

export const Laptop: React.FC<DeviceProps> = ({ width, url, urlActive, loading, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
    <div
      style={{
        ...screenStyle(width),
        borderRadius: `${width * 0.045}px ${width * 0.045}px 8px 8px`,
      }}
    >
      {loading ? <LoadingBar {...loading} /> : null}
      <BrowserBar width={width} url={url} urlActive={urlActive} />
      {children}
    </div>
    <div
      style={{
        width: width * 1.2,
        height: width * 0.037,
        marginTop: -1,
        borderRadius: `0 0 ${width * 0.034}px ${width * 0.034}px`,
        border: `1px solid ${C.border}`,
        borderTop: 'none',
        background: `linear-gradient(180deg, ${C.surface2}, ${C.surface})`,
        position: 'relative',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: width * 0.17,
          height: width * 0.014,
          borderRadius: `0 0 ${width * 0.017}px ${width * 0.017}px`,
          background: C.screenLine,
        }}
      />
    </div>
  </div>
);

export const Monitor: React.FC<DeviceProps> = ({ width, url, urlActive, loading, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
    <div style={{ ...screenStyle(width), borderRadius: width * 0.03, padding: width * 0.016 }}>
      <div
        style={{
          borderRadius: width * 0.018,
          overflow: 'hidden',
          background: C.screen,
          position: 'relative',
        }}
      >
        {loading ? <LoadingBar {...loading} /> : null}
        <BrowserBar width={width} url={url} urlActive={urlActive} />
        {children}
      </div>
    </div>
    {/* 首と台座 */}
    <div
      style={{
        width: width * 0.13,
        height: width * 0.075,
        background: C.surface2,
        borderLeft: `1px solid ${C.border}`,
        borderRight: `1px solid ${C.border}`,
      }}
    />
    <div
      style={{
        width: width * 0.42,
        height: width * 0.026,
        borderRadius: 999,
        border: `1px solid ${C.border}`,
        background: `linear-gradient(180deg, ${C.surface2}, ${C.surface})`,
      }}
    />
  </div>
);

/**
 * 画面の中の文章。`visible` 行目まで表示する。
 * 表示しない行も高さは確保するので、行が増えても画面がずれない。
 *
 * `highlight` は「上から順に 1 行ずつ光らせて全部あることを見せる」ための帯。
 * 行の高さ単位でしか動かないので、文字が半端な位置に再描画されて震えることがない。
 */
export const TextBlock: React.FC<{
  lines: string[];
  visible: number;
  fontSize: number;
  padding?: number;
  highlight?: number | null;
  /**
   * 全幅の光の帯を上から下へ走らせる位置(行単位)。
   * 帯は本文の**上に重ねる**だけで文字自体は動かさないので、滑らかに動かしても震えない。
   * 1 行だけ色を変えるより変化する面積がずっと大きく、動いていることが伝わる。
   */
  sweep?: number | null;
  /** 全体をアクセント色に一瞬光らせる (0〜1) */
  flash?: number;
  fadeBottom?: boolean;
}> = ({
  lines,
  visible,
  fontSize,
  padding,
  highlight = null,
  sweep = null,
  flash = 0,
  fadeBottom,
}) => {
  const pad = padding ?? fontSize * 1.2;
  const lineH = fontSize * 1.75;
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ padding: `${pad}px ${pad * 1.15}px`, textAlign: 'left' }}>
        {lines.map((l, i) => (
          <div
            key={i}
            style={{
              opacity: i < visible ? 1 : 0,
              background: i === highlight ? accentSoft(0.2) : 'transparent',
              fontFamily: FONT_MONO,
              fontSize,
              color: C.fg,
              height: fontSize * 1.75,
              lineHeight: `${fontSize * 1.75}px`,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            {l}
          </div>
        ))}
      </div>
      {sweep !== null ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: pad + (sweep - 1.3) * lineH,
            height: lineH * 2.6,
            backgroundImage: `linear-gradient(180deg, transparent, ${accentSoft(0.34)}, transparent)`,
            pointerEvents: 'none',
          }}
        />
      ) : null}
      {flash > 0 ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: accentSoft(0.22 * flash),
            pointerEvents: 'none',
          }}
        />
      ) : null}
      {fadeBottom ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: fontSize * 3,
            backgroundImage: `linear-gradient(180deg, transparent, ${C.screen})`,
          }}
        />
      ) : null}
    </div>
  );
};

/**
 * 「いつものやり方」で出てくるログイン画面。
 * 特定のサービスを模したものではない(ロゴも社名も出さない)。
 *
 * **右上に閉じるボタン(×)を置いてある。**これは「ログインに失敗した」ではなく
 * 「ログインできるけれど、この端末ではしたくないから閉じる」を表すため。
 * 中央に赤い ✕ を叩きつけると、どうしても「エラー」「弾かれた」に見えてしまう。
 *
 * `reveal` は上から何個目までの要素を出すか。一気に出さず段階的に出す。
 * `closeHot` を true にすると閉じるボタンが押された状態になる。
 */
export const LoginCard: React.FC<{
  width: number;
  reveal: number;
  closeHot?: boolean;
  /** マウスカーソルの移動 (0 = カード下部 / 1 = 閉じるボタンの上)。null で非表示 */
  cursorP?: number | null;
  /** クリックの波紋 (0〜1) */
  clickP?: number;
}> = ({ width, reveal, closeHot, cursorP = null, clickP = 0 }) => {
  const fs = width * 0.038;
  const on = (i: number) => (i < reveal ? 1 : 0);
  const cardW = width * 0.62;
  // 閉じるボタンの中心 (card 内座標)
  const closeX = cardW - fs * 1.75;
  const closeY = fs * 1.75;
  const curX = cursorP === null ? 0 : cardW * 0.42 + (closeX - cardW * 0.42) * cursorP;
  const curY = cursorP === null ? 0 : fs * 14 + (closeY - fs * 14) * cursorP;

  return (
    <div
      style={{
        position: 'relative',
        width: width * 0.62,
        margin: '0 auto',
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: fs,
        padding: fs * 1.3,
        boxShadow: SHADOW,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: fs * 0.75,
          right: fs * 0.75,
          width: fs * 2,
          height: fs * 2,
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: on(0),
          color: closeHot ? C.fg : C.muted,
          background: closeHot ? 'rgba(255,255,255,.16)' : 'transparent',
          boxShadow: closeHot ? `0 0 0 ${fs * 0.4}px rgba(255,255,255,.08)` : undefined,
        }}
      >
        <svg
          width={fs * 1.05}
          height={fs * 1.05}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.1}
          strokeLinecap="round"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </span>

      <div
        style={{
          opacity: on(0),
          color: C.fg,
          fontSize: fs * 1.15,
          fontWeight: 750,
          marginBottom: fs * 1.1,
          textAlign: 'center',
        }}
      >
        ログイン
      </div>

      {['メールアドレス', 'パスワード'].map((label, i) => (
        <div key={label} style={{ opacity: on(1 + i), marginBottom: fs * 0.9 }}>
          <div style={{ fontSize: fs * 0.8, color: C.muted, marginBottom: fs * 0.35 }}>
            {label}
          </div>
          <div
            style={{
              height: fs * 2.4,
              borderRadius: fs * 0.5,
              border: `1px solid ${C.border}`,
              background: C.surface2,
            }}
          />
        </div>
      ))}

      <div
        style={{
          opacity: on(3),
          height: fs * 2.5,
          borderRadius: fs * 0.5,
          background: C.accent,
          marginTop: fs * 0.9,
        }}
      />
      <div
        style={{
          opacity: on(4),
          fontSize: fs * 0.78,
          color: C.muted,
          textAlign: 'center',
          marginTop: fs * 0.8,
        }}
      >
        アカウントをお持ちでない方は登録
      </div>

      {/* 閉じるボタンまでカーソルを動かして押す。
          「押して閉じた」ところを見せないと、勝手に消えたようにしか見えない */}
      {cursorP !== null ? (
        <>
          {clickP > 0 ? (
            <span
              style={{
                position: 'absolute',
                left: closeX,
                top: closeY,
                width: fs * 5 * clickP,
                height: fs * 5 * clickP,
                marginLeft: (-fs * 5 * clickP) / 2,
                marginTop: (-fs * 5 * clickP) / 2,
                borderRadius: '50%',
                border: `${fs * 0.16}px solid rgba(255,255,255,${0.5 * (1 - clickP)})`,
              }}
            />
          ) : null}
          <svg
            width={fs * 1.9}
            height={fs * 1.9}
            viewBox="0 0 24 24"
            style={{
              position: 'absolute',
              left: curX,
              top: curY,
              transform: `scale(${clickP > 0 && clickP < 0.5 ? 0.86 : 1})`,
              filter: 'drop-shadow(0 3px 6px rgba(0,0,0,.6))',
            }}
          >
            <path
              d="M5 2.5 L5 19.5 L9.4 15.4 L12.2 21.5 L14.9 20.2 L12.2 14.4 L18.3 14.2 Z"
              fill="#fff"
              stroke="#10151c"
              strokeWidth={1.2}
              strokeLinejoin="round"
            />
          </svg>
        </>
      ) : null}
    </div>
  );
};

/**
 * 締めの行動喚起。文字ではなくボタンに見せる。
 * `shine` (0〜1) で光が左から右へ走る。ボタン全面が変わるので動きがはっきり見える。
 */
export const CtaPill: React.FC<{ text: string; size?: number; shine?: number | null }> = ({
  text,
  size = 54,
  shine = null,
}) => (
  <span
    style={{
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      overflow: 'hidden',
      fontFamily: FONT_MONO,
      fontSize: size,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      color: '#10151c',
      background: C.accent,
      borderRadius: 999,
      padding: `${size * 0.42}px ${size * 0.9}px`,
      whiteSpace: 'nowrap',
      boxShadow: `0 18px 44px -12px ${accentSoft(0.85)}`,
    }}
  >
    {text}
    {shine !== null ? (
      <span
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${shine * 140 - 30}%`,
          width: '26%',
          backgroundImage:
            'linear-gradient(100deg, transparent, rgba(255,255,255,.75), transparent)',
        }}
      />
    ) : null}
  </span>
);
