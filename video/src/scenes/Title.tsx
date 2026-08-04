import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Scene, Wordmark } from '../components/Chrome';
import { useLayout } from '../layout';
import { dropIn } from '../anim';
import { C, GRAD } from '../theme';

/**
 * 0:00 - 0:02.5 タイトル。
 *
 * いきなり実演から始めない。まず名乗って「何ができるのか」を一言で置き、
 * そのあとの実演がその説明になる、という順番にする。
 *
 * 視線の順路は上から下へ一本道: ロゴ → 下線 → タグライン 1 行目 → 2 行目。
 * 同時に 2 か所で動かさない。
 */
const T = {
  underline: [6, 18],
  line1: 14,
  line2: 26,
} as const;

export const Title: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { fk } = useLayout();

  const line = interpolate(frame, [T.underline[0], T.underline[1]], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    // 1 フレーム目がサムネイルになるので、ロゴは最初から出ている状態から始める
    <Scene durationInFrames={durationInFrames} fadeIn={false} fadeOut={false}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26 }}>
        <Wordmark size={72 * fk} />

        <div style={{ width: '100%', height: 12, borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: `${line * 100}%`, height: '100%', backgroundImage: GRAD }} />
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            marginTop: 10,
            fontSize: 46 * fk,
            fontWeight: 700,
            letterSpacing: '-0.03em',
            color: C.fg,
            whiteSpace: 'nowrap',
          }}
        >
          {/* 「ログインなしで」だけだと 発行側も不要に読めてしまう。
              ログインが要らないのは渡す先なので そう書く */}
          <div style={dropIn(frame, fps, T.line1, 26, 16)}>長文を そのまま渡す</div>
          <div style={dropIn(frame, fps, T.line2, 26, 16)}>渡す先は ログイン不要</div>
        </div>
      </div>
    </Scene>
  );
};
