import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Backdrop, Watermark } from './components/Chrome';
import { SCENES, TOTAL } from './theme';
import { Title } from './scenes/Title';
import { Demo } from './scenes/Demo';
import { Words } from './scenes/Words';
import { Cta } from './scenes/Cta';

/**
 * 60 秒の本編。
 *
 * 背景(Backdrop)とロゴ(Watermark)は Sequence の外にあるので、
 * シーンをカットで切っても光もブランドも途切れない。
 */
/**
 * シーンの切り替えは**全部カット**にしてある。
 * クロスフェードにすると、前のシーンの文字と次のシーンの文字が重なって
 * どちらも読めない 0.4 秒ができる (画面の中央にものを置く構成なので必ずぶつかる)。
 * 背景は Sequence の外にあって切れないので、カットでも急に感じない。
 */
const ORDER: {
  key: keyof typeof SCENES;
  Comp: React.FC<{ durationInFrames: number }>;
}[] = [
  { key: 'title', Comp: Title },
  { key: 'demo', Comp: Demo },
  { key: 'words', Comp: Words },
  { key: 'cta', Comp: Cta },
];

export const StashNotes: React.FC = () => (
  <AbsoluteFill>
    <Backdrop />
    {ORDER.map(({ key, Comp }, i) => {
      const s = SCENES[key];
      const isLast = i === ORDER.length - 1;
      const duration = isLast ? TOTAL - s.from : s.duration;
      return (
        <Sequence key={key} name={key} from={s.from} durationInFrames={duration} layout="none">
          <Comp durationInFrames={duration} />
        </Sequence>
      );
    })}
    {/* ロゴは Sequence の外。途中で離脱した人にも名前を残す */}
    <Watermark />
  </AbsoluteFill>
);
