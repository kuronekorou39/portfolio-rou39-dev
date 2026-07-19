import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initTheme } from './lib/theme';
import './index.css';

// 保存済みテーマを最初の描画前に適用(CSP が inline script を禁止しているため
// head ではなくここで行う。エントリ実行までの一瞬は OS テーマで表示される)
initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
