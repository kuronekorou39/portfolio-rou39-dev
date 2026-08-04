import React from 'react';
import { Composition } from 'remotion';
import { StashNotes } from './StashNotes';
import { FPS, TOTAL } from './theme';

/**
 * 同じ本編を 3 比率で書き出す。
 * レイアウトの分岐は src/layout.ts の useLayout() が useVideoConfig() から判定するので、
 * ここでは寸法を変えるだけでよい。
 */
export const RemotionRoot: React.FC = () => (
  <>
    {/* X / Instagram リール / TikTok / YouTube Shorts */}
    <Composition
      id="StashNotes32-Vertical"
      component={StashNotes}
      durationInFrames={TOTAL}
      fps={FPS}
      width={1080}
      height={1920}
    />
    {/* X タイムライン / YouTube / サイト埋め込み */}
    <Composition
      id="StashNotes32-Landscape"
      component={StashNotes}
      durationInFrames={TOTAL}
      fps={FPS}
      width={1920}
      height={1080}
    />
    {/* Instagram フィード */}
    <Composition
      id="StashNotes32-Square"
      component={StashNotes}
      durationInFrames={TOTAL}
      fps={FPS}
      width={1080}
      height={1080}
    />
  </>
);
