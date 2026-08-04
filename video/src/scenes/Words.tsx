import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Grad, Scene } from '../components/Chrome';
import { useLayout } from '../layout';
import { bounceIn } from '../anim';
import { C, GRAD } from '../theme';

/**
 * 0:27.2 - 0:29.8 実演で見せたことを 3 語で言い直す。
 *
 * **「登録ナシ」とは言えない。**メモを発行するには Google ログインが要る。
 * 要らないのは**渡す先**なので、小さく「渡す先は」を置いてから 3 語を出す。
 * 主語を省くと嘘になる。
 */
const LEAD = '渡す先は';
const WORDS = ['ログイン不要', 'アプリ不要', 'URLだけ'];
const LEAD_AT = 0;
const FIRST = 14;
const EVERY = 15;
const UNDERLINE = [58, 70] as const;

export const Words: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { fk } = useLayout();

  const line = interpolate(frame, [UNDERLINE[0], UNDERLINE[1]], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // 締めへはカットで切る (fadeOut={false})。中央の大きな文字どうしが混ざると読めなくなる
  return (
    <Scene durationInFrames={durationInFrames} fadeIn={false} fadeOut={false}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            ...bounceIn(frame, fps, LEAD_AT, 0.7, 14),
            fontSize: 38 * fk,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: C.muted,
            marginBottom: 6,
          }}
        >
          {LEAD}
        </div>

        {WORDS.map((w, i) => {
          const last = i === WORDS.length - 1;
          return (
            <div
              key={w}
              style={{
                ...bounceIn(frame, fps, FIRST + i * EVERY, 0.55, 16),
                position: 'relative',
                fontSize: (last ? 96 : 78) * fk,
                lineHeight: 1.16,
                fontWeight: 800,
                letterSpacing: '-0.04em',
                whiteSpace: 'nowrap',
              }}
            >
              {last ? <Grad>{w}</Grad> : w}
              {last ? (
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    bottom: -14,
                    height: 10,
                    width: `${line * 100}%`,
                    borderRadius: 999,
                    backgroundImage: GRAD,
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </Scene>
  );
};
