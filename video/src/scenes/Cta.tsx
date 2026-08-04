import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Scene, Sub, Wordmark } from '../components/Chrome';
import { CtaPill } from '../components/Product';
import { useLayout } from '../layout';
import { bounceIn, dropIn } from '../anim';

/**
 * 0:21.7 - 0:24 締め。
 * ドメインをグラデ文字ではなく**押せそうなボタン**にして 行動を指示する。
 *
 * 光を走らせるのは 1 回だけ。「押せる」ことを示す意味があるので残しているが、
 * 意味のない脈打ちの繰り返しはしない。
 */
const SHINE = [30, 48] as const;

export const Cta: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { isWide, fk } = useLayout();

  const shine =
    frame >= SHINE[0] && frame <= SHINE[1]
      ? interpolate(frame, [SHINE[0], SHINE[1]], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : null;

  return (
    <Scene durationInFrames={durationInFrames} fadeIn={false}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34 }}>
        <div style={dropIn(frame, fps, 0, 40, 16)}>
          <Wordmark size={isWide ? 54 : 50} />
        </div>

        <div style={bounceIn(frame, fps, 10, 0.68, 16)}>
          <CtaPill text="notes.rou39.com" size={52 * fk} shine={shine} />
        </div>

        {/* 発行には Google ログインが要る。ここを伏せると
            リンクを踏んだ瞬間に裏切られたことになるので、短くても必ず書く */}
        <div style={bounceIn(frame, fps, 20, 0.7, 16)}>
          <Sub size={30}>無料 Googleアカウントで はじめる</Sub>
        </div>
      </div>
    </Scene>
  );
};
