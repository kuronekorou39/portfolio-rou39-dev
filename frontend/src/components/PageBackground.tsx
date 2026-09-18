// 夜景の背景(frontend/public/bg/bg-1〜8.webp)。ページを読み込むたびに1枚選ぶ。
// モジュールの読み込み時に決めるので、サイト内を移動している間は同じ絵のまま変わらない。
const PATTERN_COUNT = 8;
const chosen = 1 + Math.floor(Math.random() * PATTERN_COUNT);

// 文字が読めるよう、サイトの地の色(#060608)のベールを重ねる。下ほど濃くして本文側を沈める
const VEIL = 'linear-gradient(rgba(6, 6, 8, 0.72), rgba(6, 6, 8, 0.9))';

/**
 * 親に `relative isolate` を付けて使う。isolate が無いと -z-10 が Layout の地の色の裏に回って見えなくなる。
 * background-attachment: fixed は iOS で効かないので、fixed の要素として敷く。
 */
export default function PageBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center"
      style={{ backgroundImage: `${VEIL}, url("/bg/bg-${chosen}.webp")` }}
    />
  );
}
