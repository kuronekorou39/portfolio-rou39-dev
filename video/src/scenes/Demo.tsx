import React from 'react';
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Caption, CaptionSlot, Scene } from '../components/Chrome';
import { CountBadge, Laptop, LoginCard, Monitor, TextBlock } from '../components/Product';
import { useLayout } from '../layout';
import { dropIn } from '../anim';
import { C, accentSoft } from '../theme';
import { DOC, DOC_COUNT, LOGIN_URL, MEMO_URL, docFontSize } from '../doc';

/**
 * 0:02.5 - 0:27.5 実演。**カットで切り替えない。**
 *
 * 1 枚のキャンバスに描き足していく作りにしてある:
 *   ① 手元の PC を中央に大きく描く (長文と文字数)
 *   ② そのまま**左上へ縮んで移動**し、画面に残る
 *   ③ 入れ替わりに渡す先の PC が**右から入ってくる**
 *   ④ その中でログイン画面を**自分で閉じ**、URL を開くと原稿が届く
 *
 * ①が消えないので「さっきの長文が、あっちの端末に出た」という繋がりが切れない。
 *
 * 字幕は 5 つで 1 つの文になっている:
 *   この長文を → 別の端末に送りたい → でも ここではログインしたくない
 *   → URLを開くだけ → 全部そのまま
 *
 * **ログインは「できない」のではなく「したくない」。**
 * 中央に赤い ✕ を叩きつけると失敗に見えるので、右上の閉じるボタンを押して畳む。
 * 背景も赤くしない (`Backdrop` に警告色は入れていない)。
 *
 * **視線の順路は常に一本道。**同時に 2 か所を動かさない。
 * 間はわざと長めに取ってある (尺より伝わりやすさを優先)。
 */

/* 端末の外形。中身から計算した実測比 */
const LAP_W = 1.2; // ノート PC の外形幅 = lapW * 1.2 (底面のほうが広い)
const LAP_H = 1.199;
const MON_H = 1.295; // モニタの外形高さ = monW * 1.295 (首と台座を含む)
const CAPTION_H = 140;

/** シーン先頭からのフレーム。間合いはここだけで決まる */
const T = {
  // ① 手元の PC
  lapIn: 0,
  cap1: [14, 150], // この長文を
  sweep1: [36, 92],
  count1: [36, 92],
  badge1Pop: 98,
  cap2: [150, 410], // 別の端末に送りたい
  copyAt: 170,
  chipFrom: 186,

  // ② → ③ 場所を空けて 次を迎える
  lapToCorner: [232, 286],
  monIn: [262, 322],

  // ④ 渡す先の PC
  load1: [328, 354, 362],
  cardIn: 360,
  reveal: [368, 376, 384, 392, 400],
  cap3: [410, 524], // でも ここではログインしたくない
  // 閉じるまでを 1 つずつ見せる。カーソルが動く → 押す → 畳まれる
  cursorFrom: 424,
  cursorMove: [430, 458],
  clickAt: 464,
  cardOut: [478, 498], // 畳まれて消える
  urlSwapAt: 512, // 空いた画面に コピーしておいた URL を開く
  load2: [512, 538, 546],
  linesFrom: 532,
  badge2Pop: 624,
  cap4: [524, 642], // URLを開くだけ
  cap5From: 642, // 全部そのまま
  sweep2: [656, 704],
  sweep3: [714, 752],
} as const;

const LINE_STEP = 6;

const ramp = (frame: number, [a, b, c]: readonly [number, number, number]) => ({
  progress: interpolate(frame, [a, b], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  }),
  opacity: interpolate(frame, [a, b, c], [1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  }),
});

const sweepAt = (frame: number, [a, b]: readonly [number, number]) =>
  frame >= a && frame <= b ? interpolate(frame, [a, b], [-1, DOC.length + 1]) : null;

export const Demo: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { width, height, safe, isTall, isWide } = useLayout();

  /* ---------------- キャンバスの寸法と、2 台の置き場所 ---------------- */
  const stageW = width - safe.x * 2;
  const stageH = height - safe.top - safe.bottom - CAPTION_H;

  const lapW = isTall ? 700 : isWide ? 620 : 560;
  const monW = isTall ? 640 : isWide ? 560 : 500;
  // 左上に残す縮小版。小さすぎると「さっきの長文」だと分からないので大きめに取る
  // (モニタの上端と重ならない範囲での上限)
  const cornerScale = isTall ? 0.26 : 0.24;
  const lapFs = docFontSize(lapW);
  const monFs = docFontSize(monW);

  const lapCenter = {
    left: Math.round((stageW - lapW * LAP_W) / 2),
    top: Math.round((stageH - lapW * LAP_H) / 2),
  };
  const monCenter = {
    left: Math.round((stageW - monW) / 2),
    top: Math.round((stageH - monW * MON_H) / 2),
  };

  // ① 中央 → 左上。縮小は左上を軸にするので left/top がそのまま角の座標になる
  const moveP = interpolate(frame, [T.lapToCorner[0], T.lapToCorner[1]], [0, 1], {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const lapLeft = Math.round(lapCenter.left * (1 - moveP));
  const lapTop = Math.round(lapCenter.top * (1 - moveP));
  const lapScale = 1 + (cornerScale - 1) * moveP;

  // ③ 右の画面外 → 中央
  const monP = interpolate(frame, [T.monIn[0], T.monIn[1]], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const monLeft = Math.round((stageW + 80) * (1 - monP) + monCenter.left * monP);

  /* ---------------- ① 手元の PC の中身 ---------------- */
  const count1 = Math.round(
    interpolate(frame, T.count1, [0, DOC_COUNT], {
      easing: Easing.out(Easing.cubic),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );
  const badge1 = spring({
    frame: frame - T.badge1Pop,
    fps,
    config: { damping: 9, mass: 0.5, stiffness: 300 },
    durationInFrames: 16,
  });
  const badge1Scale =
    frame < T.badge1Pop ? 1 : 1 + 0.22 * Math.sin(Math.PI * Math.min(1, badge1));

  /* ---------------- ④ 渡す先の PC の中身 ---------------- */
  const opened = frame >= T.urlSwapAt;
  const loading =
    frame >= T.load1[0] && frame < T.load2[2]
      ? ramp(frame, opened ? T.load2 : T.load1)
      : undefined;

  const reveal = T.reveal.filter((f) => frame >= f).length;
  const cursorP =
    frame >= T.cursorFrom && frame <= T.cardOut[1]
      ? interpolate(frame, T.cursorMove, [0, 1], {
          easing: Easing.inOut(Easing.cubic),
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : null;
  const clickP =
    frame >= T.clickAt
      ? interpolate(frame, [T.clickAt, T.clickAt + 16], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 0;
  const closeHot = frame >= T.clickAt && frame < T.cardOut[0] + 4;
  // 「畳んで消える」動き。膨らませて弾き飛ばすと拒絶されたように見えてしまう
  const gone = interpolate(frame, T.cardOut, [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cardDrop = spring({
    frame: frame - T.cardIn,
    fps,
    config: { damping: 12, mass: 0.6, stiffness: 260 },
    durationInFrames: 16,
  });
  const cardY = Math.round((1 - cardDrop) * -48 + gone * 22);
  const cardOpacity = Math.min(1, cardDrop * 2.2) * (1 - gone);

  const visible = Math.max(0, Math.floor((frame - T.linesFrom) / LINE_STEP) + 1);
  const count2 = Math.round(
    interpolate(frame, [T.linesFrom, T.linesFrom + DOC.length * LINE_STEP + 8], [0, DOC_COUNT], {
      easing: Easing.out(Easing.quad),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );
  const badge2 = spring({
    frame: frame - T.badge2Pop,
    fps,
    config: { damping: 9, mass: 0.5, stiffness: 300 },
    durationInFrames: 16,
  });
  const badge2Scale =
    frame < T.badge2Pop ? 1 : 1 + 0.22 * Math.sin(Math.PI * Math.min(1, badge2));

  const sweep2 = sweepAt(frame, T.sweep2) ?? sweepAt(frame, T.sweep3);

  return (
    <Scene durationInFrames={durationInFrames} fadeIn={false} fadeOut={false}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* 5 つで 1 つの文になっている */}
        <CaptionSlot height={CAPTION_H}>
          <Caption from={T.cap1[0]} to={T.cap1[1]}>
            この長文を
          </Caption>
          <Caption from={T.cap2[0]} to={T.cap2[1]}>
            別の端末に送りたい
          </Caption>
          <Caption from={T.cap3[0]} to={T.cap3[1]} size={44}>
            でも ここではログインしたくない
          </Caption>
          <Caption from={T.cap4[0]} to={T.cap4[1]}>
            URLを開くだけ
          </Caption>
          <Caption from={T.cap5From} to={durationInFrames}>
            全部そのまま
          </Caption>
        </CaptionSlot>

        {/* ここが 1 枚のキャンバス。2 台とも絶対配置で置き、消さずに動かす */}
        <div style={{ position: 'relative', width: stageW, height: stageH }}>
          {/* ① 手元の PC。中央に描いたあと 左上へ縮んで残り続ける */}
          <div
            style={{
              ...dropIn(frame, fps, T.lapIn, 46, 20),
              position: 'absolute',
              left: lapLeft,
              top: lapTop,
              transform: `scale(${lapScale})`,
              transformOrigin: 'top left',
            }}
          >
            <div style={{ position: 'relative' }}>
              <Laptop width={lapW} url={MEMO_URL} urlActive={frame >= T.copyAt}>
                <TextBlock
                  lines={DOC}
                  visible={DOC.length}
                  fontSize={lapFs}
                  sweep={sweepAt(frame, T.sweep1)}
                  fadeBottom
                />
              </Laptop>

              {/* 数え始めと同時に出す。「0 文字」で置いておくと意味が分からない */}
              {frame >= T.count1[0] ? (
                <div
                  style={{
                    position: 'absolute',
                    right: -lapW * 0.04,
                    bottom: lapW * 0.07,
                    transform: badge1Scale === 1 ? undefined : `scale(${badge1Scale})`,
                  }}
                >
                  <CountBadge value={count1} size={lapW * 0.046} />
                </div>
              ) : null}

              {/* URL の真下。視線を動かさずに「コピーした」を受け取れる位置 */}
              {frame >= T.chipFrom && frame < T.lapToCorner[0] ? (
                <div
                  style={{
                    ...dropIn(frame, fps, T.chipFrom, 18, 14),
                    position: 'absolute',
                    top: lapW * 0.11,
                    right: lapW * 0.03,
                    fontSize: lapW * 0.034,
                    fontWeight: 700,
                    color: C.accent,
                    background: accentSoft(0.22),
                    border: `1px solid ${accentSoft(0.6)}`,
                    borderRadius: 999,
                    padding: `${lapW * 0.013}px ${lapW * 0.03}px`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  URLをコピー
                </div>
              ) : null}
            </div>
          </div>

          {/* ③ 渡す先の PC。右の画面外から入ってきて中央に着く */}
          {frame >= T.monIn[0] ? (
            <div style={{ position: 'absolute', left: monLeft, top: monCenter.top }}>
              <div style={{ position: 'relative' }}>
                <Monitor
                  width={monW}
                  url={opened ? MEMO_URL : LOGIN_URL}
                  urlActive={opened}
                  loading={loading}
                >
                  <div
                    style={{
                      position: 'relative',
                      height: DOC.length * monFs * 1.75 + monFs * 1.2 * 2,
                    }}
                  >
                    <div style={{ position: 'absolute', inset: 0 }}>
                      <TextBlock
                        lines={DOC}
                        visible={visible}
                        fontSize={monFs}
                        sweep={sweep2}
                        fadeBottom
                      />
                    </div>

                    {gone < 1 ? (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <div
                          style={{
                            opacity: cardOpacity,
                            transform: `translateY(${cardY}px) scale(${1 - 0.12 * gone})`,
                            width: '100%',
                          }}
                        >
                          <LoginCard
                            width={monW}
                            reveal={reveal}
                            closeHot={closeHot}
                            cursorP={cursorP}
                            clickP={clickP}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </Monitor>

                {frame >= T.linesFrom ? (
                  <div
                    style={{
                      position: 'absolute',
                      right: -monW * 0.04,
                      bottom: monW * 0.12,
                      transform: badge2Scale === 1 ? undefined : `scale(${badge2Scale})`,
                    }}
                  >
                    <CountBadge value={count2} size={monW * 0.046} />
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Scene>
  );
};
