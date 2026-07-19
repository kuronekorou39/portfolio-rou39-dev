/**
 * テーマ切替(自動=OS追従 / ライト / ダーク)。
 * 選択は localStorage に保存し、<html data-theme="..."> で CSS 変数を切り替える
 * (未指定=自動は data-theme 無し → prefers-color-scheme のメディアクエリが効く)。
 * このファイルは lib/auth を import しない(メモ画面チャンクからも使うため)。
 */

export type ThemeMode = 'system' | 'light' | 'dark';

const KEY = 'notes_theme';
const LIGHT_BG = '#fafaf8';
const DARK_BG = '#16181d';

export function getThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** data-theme 属性と theme-color メタを現在のモードに合わせる。 */
export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', mode);
  }
  // 手動指定時はブラウザUI(モバイルのアドレスバー等)の色も固定する。
  // 自動時は media 属性付きメタ2枚が OS 設定に追従するので元の値に戻す。
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  metas.forEach((m) => {
    if (mode === 'system') {
      m.content = m.media.includes('dark') ? DARK_BG : LIGHT_BG;
    } else {
      m.content = mode === 'dark' ? DARK_BG : LIGHT_BG;
    }
  });
}

/** 自動 → ライト → ダーク → 自動 の順に循環。新しいモードを返す。 */
export function cycleTheme(): ThemeMode {
  const order: ThemeMode[] = ['system', 'light', 'dark'];
  const next = order[(order.indexOf(getThemeMode()) + 1) % order.length];
  try {
    if (next === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    /* storage 不可でも表示だけは切り替える */
  }
  applyTheme(next);
  return next;
}

/** 起動時に保存済みモードを適用する(main.tsx の先頭で呼ぶ)。 */
export function initTheme(): void {
  applyTheme(getThemeMode());
}

export const themeLabel: Record<ThemeMode, string> = {
  system: '自動',
  light: 'ライト',
  dark: 'ダーク',
};
