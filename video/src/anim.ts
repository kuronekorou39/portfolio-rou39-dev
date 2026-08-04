import { interpolate, spring } from 'remotion';
import type { CSSProperties } from 'react';

/**
 * 出現アニメのヘルパ。
 *
 * どれも「動いて止まる」もので、動き続けるものは作らない。
 * ずっと少しずつ動かすと、文字が毎フレーム半端な位置に再描画されて震えて見えるため。
 * 止まったあとの位置は必ず整数 px になるようにしてある。
 */

/**
 * 上から落ちてきて弾む。
 *
 * 尺は短くしてある。ゆっくり settle するバネは 1 フレームあたりの変化量が小さく、
 * 「動いていない」ように見える (実測でも静止判定される)。ポップに見せたいなら速く動かす。
 */
export const dropIn = (
  frame: number,
  fps: number,
  delay = 0,
  distance = 54,
  durationInFrames = 18,
): CSSProperties => {
  const s = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, mass: 0.6, stiffness: 260 },
    durationInFrames,
  });
  const y = Math.round((1 - s) * -distance);
  return { opacity: Math.min(1, s * 2.2), transform: y === 0 ? undefined : `translateY(${y}px)` };
};

/** ぽんっと弾んで出る */
export const bounceIn = (
  frame: number,
  fps: number,
  delay = 0,
  from = 0.72,
  durationInFrames = 18,
): CSSProperties => {
  const s = spring({
    frame: frame - delay,
    fps,
    config: { damping: 9, mass: 0.5, stiffness: 260 },
    durationInFrames,
  });
  const scale = from + (1 - from) * s;
  return {
    opacity: Math.min(1, s * 2.4),
    transform: scale === 1 ? undefined : `scale(${scale})`,
  };
};

/** 下からふわっと出す */
export const rise = (
  frame: number,
  fps: number,
  delay = 0,
  distance = 36,
  durationInFrames = 24,
): CSSProperties => {
  const s = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
    durationInFrames,
  });
  const y = Math.round((1 - s) * distance);
  return { opacity: s, transform: y === 0 ? undefined : `translateY(${y}px)` };
};

/** [from, to] の区間だけ表示する不透明度 */
export const inOut = (frame: number, from: number, to: number, fade = 9) =>
  interpolate(frame, [from, from + fade, to - fade, to], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
