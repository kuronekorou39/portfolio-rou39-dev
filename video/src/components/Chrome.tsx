import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { accent2Soft, accentSoft, C, FONT_SANS, GRAD, SCENES, XFADE } from '../theme';
import { useLayout } from '../layout';

/**
 * 全シーンの下に敷きっぱなしの背景。
 * Sequence の外に置くので useCurrentFrame() は動画全体の通し フレームになり、
 * シーンが切り替わっても光の動きが途切れない。
 */
export const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = frame / durationInFrames;

  // 2 つの光球をゆっくり別方向に流す(60 秒で 1 往復しない速さ)
  const ax = interpolate(t, [0, 1], [34, 62]);
  const ay = interpolate(t, [0, 1], [22, 44]);
  const bx = interpolate(t, [0, 1], [74, 40]);
  const by = interpolate(t, [0, 1], [58, 26]);
  // 明滅は極小に。強くすると文字の後ろの明るさが毎フレーム変わり、ちらついて見える
  const breathe = 0.97 + 0.03 * Math.sin(frame / 46);

  // 背景は赤くしない。ログイン画面は「失敗した」のではなく「自分で閉じる」ものなので、
  // 警告色を当てると意味が変わってしまう。
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <AbsoluteFill
        style={{
          opacity: 1.05 * breathe,
          backgroundImage: [
            `radial-gradient(closest-side, ${accentSoft(0.34)}, transparent 72%)`,
            `radial-gradient(closest-side, ${accent2Soft(0.28)}, transparent 72%)`,
          ].join(','),
          backgroundPosition: `${ax}% ${ay}%, ${bx}% ${by}%`,
          backgroundSize: '78% 58%, 66% 52%',
          backgroundRepeat: 'no-repeat',
          filter: 'blur(26px)',
        }}
      />
      {/* 四隅を落として中央に視線を集める */}
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(125% 95% at 50% 45%, transparent 42%, rgba(0,0,0,.42) 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * シーンの外枠。
 * - 前後 XFADE フレームでクロスフェード(隣の Sequence と重ねて使う)
 * - 全体をゆっくり拡大し続けて「止まって見える時間」を作らない
 * - SNS の UI が被る領域を避けたセーフエリアを内側に用意する
 */
export const Scene: React.FC<{
  durationInFrames: number;
  children: React.ReactNode;
  /** 中身を中央寄せせず自前で組みたいとき */
  raw?: boolean;
  align?: React.CSSProperties['justifyContent'];
  /** 先頭のシーンは false にする。1 フレーム目がサムネイルになるので黒から始めない */
  fadeIn?: boolean;
  /**
   * 次のシーンへカットで切るときは false。
   * 中央の大きな文字どうしが重なるクロスフェードは、混ざって読めなくなる。
   */
  fadeOut?: boolean;
}> = ({ durationInFrames, children, raw, align = 'center', fadeIn = true, fadeOut = true }) => {
  const frame = useCurrentFrame();
  const { safe } = useLayout();

  // シーン全体をゆっくり拡大する演出は入れない。
  // 1 フレームごとに文字が半端な位置に再描画されて、文字が小刻みに震えて見えるため。
  // 動きは実演そのものだけで作る。
  const opacity = interpolate(
    frame,
    [
      ...(fadeIn ? [0, XFADE] : [-1, 0]),
      ...(fadeOut
        ? [durationInFrames - XFADE, durationInFrames]
        : [durationInFrames, durationInFrames + 1]),
    ],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill
      style={{
        opacity,
        fontFamily: FONT_SANS,
        color: C.fg,
      }}
    >
      <AbsoluteFill
        style={{
          paddingTop: safe.top,
          paddingBottom: safe.bottom,
          paddingLeft: safe.x,
          paddingRight: safe.x,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: raw ? 'stretch' : 'center',
          justifyContent: raw ? 'stretch' : align,
        }}
      >
        {/* raw のときは「セーフエリアぴったりの座標系」を渡す。
            中で <AbsoluteFill> を重ねればカットの切り替えができる。 */}
        {raw ? (
          <div style={{ position: 'relative', flex: 1, width: '100%' }}>{children}</div>
        ) : (
          children
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** 🗒️ の代わりに favicon.svg と同じ形を描く(絵文字はレンダラ依存なので使わない) */
export const Mark: React.FC<{ size?: number }> = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <rect x="8" y="12" width="48" height="44" rx="6" fill={C.accent} />
    <rect x="14" y="6" width="14" height="10" rx="3" fill={C.accent} />
    <rect x="32" y="8" width="12" height="8" rx="3" fill={C.accent2} />
    <rect x="15" y="24" width="34" height="4" rx="2" fill={C.screen} />
    <rect x="15" y="33" width="34" height="4" rx="2" fill={C.screen} opacity={0.85} />
    <rect x="15" y="42" width="22" height="4" rx="2" fill={C.screen} opacity={0.7} />
  </svg>
);

export const Wordmark: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.34 }}>
    <Mark size={size * 1.18} />
    <span style={{ fontSize: size, fontWeight: 700, letterSpacing: '-0.015em' }}>Stash Notes</span>
  </div>
);

/**
 * 左上に出しっぱなしにするロゴ。
 * 最後まで見ない人が大半なので、締めのカットだけに名前を出すと誰にも残らない。
 * Sequence の外に置くのでシーンが変わっても消えない。
 */
export const Watermark: React.FC = () => {
  const frame = useCurrentFrame();
  const { safe } = useLayout();
  // タイトルで大きいロゴを出している間は隠す(同じものが 2 か所にあると視線が散る)
  const opacity = interpolate(frame, [SCENES.demo.from - 6, SCENES.demo.from + 10], [0, 0.92], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill
      style={{
        padding: `${safe.top}px ${safe.x}px`,
        fontFamily: FONT_SANS,
        color: C.fg,
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        opacity,
      }}
    >
      <Wordmark size={28} />
    </AbsoluteFill>
  );
};

/**
 * 画面全体を一瞬光らせる。
 * 変化する面積が最大なので、間が空きそうなところの繋ぎに効く。
 */
export const Flash: React.FC<{ opacity: number; color?: string }> = ({ opacity, color }) =>
  opacity <= 0 ? null : (
    <AbsoluteFill
      style={{ background: color ?? accentSoft(1), opacity, pointerEvents: 'none' }}
    />
  );

/** グラデーション文字 */
export const Grad: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    style={{
      backgroundImage: GRAD,
      backgroundClip: 'text',
      WebkitBackgroundClip: 'text',
      color: 'transparent',
    }}
  >
    {children}
  </span>
);

/**
 * 実演に添える 1 行の字幕。
 * 複数の Caption を同じ CaptionSlot に重ねて、表示区間だけクロスフェードさせる。
 * スロットの高さは固定なので、字幕が入れ替わっても下のデバイスは動かない。
 */
export const CaptionSlot: React.FC<{ height: number; children: React.ReactNode }> = ({
  height,
  children,
}) => (
  <div style={{ position: 'relative', height, width: '100%' }}>{children}</div>
);

export const Caption: React.FC<{
  from: number;
  to: number;
  size?: number;
  children: React.ReactNode;
}> = ({ from, to, size = 50, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { fk } = useLayout();
  const opacity = interpolate(frame, [from, from + 8, to - 10, to], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // 出るときだけ少し弾ませる(出たあとは動かさない)
  const s = spring({
    frame: frame - from,
    fps,
    config: { damping: 11, mass: 0.6, stiffness: 200 },
    durationInFrames: 26,
  });
  const scale = 0.88 + 0.12 * s;
  if (opacity <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity,
        transform: scale >= 0.999 && scale <= 1.001 ? undefined : `scale(${scale})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * fk,
        fontWeight: 800,
        letterSpacing: '-0.025em',
        textAlign: 'center',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  );
};

export const Sub: React.FC<{ children: React.ReactNode; size?: number }> = ({
  children,
  size = 32,
}) => {
  const { fk } = useLayout();
  return (
    <p
      style={{
        fontSize: size * fk,
        lineHeight: 1.6,
        color: C.muted,
        margin: 0,
        textAlign: 'center',
        textWrap: 'balance',
      }}
    >
      {children}
    </p>
  );
};
