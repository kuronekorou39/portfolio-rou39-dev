import { useVideoConfig } from 'remotion';

/**
 * 縦(9:16) / 横(16:9) / 正方形(1:1) の 3 比率を 1 つのシーン実装で賄うためのヘルパ。
 *
 * 3 比率とも短辺は 1080px なので、フォントサイズや部品サイズは「短辺 1080 基準の実 px」で
 * そのまま書ける。比率ごとに変わるのは
 *   - 積む方向(縦・正方形は縦積み / 横は横並び)
 *   - 使える余白(縦は上下に広い / 横は左右に広い)
 *   - SNS の UI が被る領域(セーフエリア)
 * の 3 点だけなので、それをこのフックに閉じ込める。
 */
export type Format = 'vertical' | 'landscape' | 'square';

export type Layout = {
  format: Format;
  width: number;
  height: number;
  /** 横長。ステップやデバイスを横並びにしてよい */
  isWide: boolean;
  /** 縦長。上下に余裕があるので大きく積める */
  isTall: boolean;
  isSquare: boolean;
  /** SNS の UI(リールの右側アイコン・下部キャプション等)を避けるための内側余白 */
  safe: { top: number; bottom: number; x: number };
  /** 本文コンテンツの最大幅 */
  maxContentWidth: number;
  /** 見出しの倍率。横長は画面に対して字が小さく見えるので少し上げる */
  fk: number;
};

export const useLayout = (): Layout => {
  const { width, height } = useVideoConfig();
  const isWide = width > height;
  const isTall = height > width;
  const isSquare = width === height;

  const format: Format = isWide ? 'landscape' : isTall ? 'vertical' : 'square';

  // 縦動画は上部にユーザー名、下部にキャプションと音源表示が被るので厚めに逃がす。
  const safe = isTall
    ? { top: 170, bottom: 280, x: 76 }
    : isWide
      ? { top: 72, bottom: 72, x: 132 }
      : { top: 76, bottom: 76, x: 76 };

  return {
    format,
    width,
    height,
    isWide,
    isTall,
    isSquare,
    safe,
    maxContentWidth: isWide ? 1560 : 928,
    fk: isWide ? 1.12 : 1,
  };
};
