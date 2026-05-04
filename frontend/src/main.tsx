import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// F12 で Console を開いた人へのご挨拶
console.log(
  '%cキャー！ えっち！',
  'color:#ff69b4;font-size:32px;font-weight:bold;text-shadow:2px 2px 0 #fff,4px 4px 0 rgba(0,0,0,.12);padding:8px 0;',
);
console.log(
  '%cF12 でソース覗くなんて……。\n何もないので、 お引き取りください ☆',
  'color:#9a8e80;font-size:13px;line-height:1.7;',
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
