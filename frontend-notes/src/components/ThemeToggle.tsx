import { useState } from 'react';
import { cycleTheme, getThemeMode, themeLabel } from '../lib/theme';

/** テーマ切替ボタン(自動→ライト→ダークの循環)。auth に依存しない。 */
export default function ThemeToggle() {
  const [mode, setMode] = useState(getThemeMode());
  const icon = mode === 'light' ? '☀' : mode === 'dark' ? '☾' : '◐';
  return (
    <button
      onClick={() => setMode(cycleTheme())}
      title={`テーマ: ${themeLabel[mode]}(クリックで切替)`}
      style={{
        border: '1px solid var(--border)',
        background: 'transparent',
        color: 'var(--muted)',
        borderRadius: 99,
        fontSize: 12,
        padding: '2px 10px',
        whiteSpace: 'nowrap',
      }}
    >
      {icon} {themeLabel[mode]}
    </button>
  );
}
