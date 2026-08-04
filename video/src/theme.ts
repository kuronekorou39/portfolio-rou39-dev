/**
 * Stash Notes 宣伝動画のデザイントークン。
 *
 * 色は frontend-notes/src/pages/Landing.tsx の `--lp-*`(ダーク側)と同じ値。
 * 動画はダーク基調で作る(SNS のフィード上で最も締まって見えるため)。
 * プロダクト側の色を変えたときは、ここも合わせて更新すること。
 */
export const C = {
  bg: '#0f1116',
  surface: '#191c22',
  surface2: '#20242c',
  fg: '#edecf0',
  muted: '#9a988f',
  border: '#2c313a',
  accent: '#6ea8ff',
  accent2: '#a78bff',
  ok: '#5cd39a',
  danger: '#e0796a',
  screen: '#12151b',
  screenLine: '#262b34',
} as const;

/** 半透明のアクセント(color-mix はレンダラ差が出るので rgba で固定) */
export const accentSoft = (a: number) => `rgba(110, 168, 255, ${a})`;
export const accent2Soft = (a: number) => `rgba(167, 139, 255, ${a})`;
export const okSoft = (a: number) => `rgba(92, 211, 154, ${a})`;
export const dangerSoft = (a: number) => `rgba(224, 121, 106, ${a})`;

/**
 * フォントはプロダクトと同じく「システムフォントのみ」。
 * 日本語は Windows のレンダリング環境で確実に見つかる順で並べる。
 */
export const FONT_SANS =
  "'Segoe UI', 'Yu Gothic UI', 'Yu Gothic', 'Meiryo', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', system-ui, sans-serif";
export const FONT_MONO = "'Cascadia Mono', Consolas, 'Courier New', ui-monospace, monospace";

export const GRAD = `linear-gradient(100deg, ${C.accent}, ${C.accent2})`;

/** 動画全体の尺。30fps × 32秒。尺より伝わりやすさを優先して間を取ってある */
export const FPS = 30;
export const TOTAL = 32 * FPS; // 960

/**
 * シーンの割り当て(フレーム)。合計が TOTAL になるようにする。
 * 尺を調整するときはここだけを触れば全比率に反映される。
 *
 * 伝えることは「ログインしたくない端末へ長文を渡す」の 1 点だけ。機能の紹介はしない。
 * 広告なので字幕に句読点(、。)は使わず、分かち書きにする。
 *
 * まずタイトルで「何ができるのか」を名乗り、そのあとの実演がその説明になる、という順番。
 *
 * 実演は 1 つのシーン (demo) にまとめてある。カットで切り替えるのではなく、
 * 描いたものを画面に残したまま脇へ寄せ、次のものが横から入ってくる。
 * 締めの 3 語と行動喚起だけは普通のカット切り替え。
 */
export const SCENES = {
  title: { from: 0, duration: 75 }, // 0:00 - 0:02.5  ロゴとタグライン
  demo: { from: 75, duration: 740 }, // 0:02.5 - 0:27.2  1 枚のキャンバスに積み上がる実演
  words: { from: 815, duration: 80 }, // 0:27.2 - 0:29.8  渡す先は ログイン不要 / アプリ不要 / URLだけ
  cta: { from: 895, duration: 65 }, // 0:29.8 - 0:32  行動喚起
} as const;

/** 隣り合うシーンをクロスフェードさせる重なり幅 */
export const XFADE = 12;
