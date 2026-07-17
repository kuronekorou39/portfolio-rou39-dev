import { lazy, Suspense } from 'react';

// メモ画面(/m)と管理画面は「両方 lazy」でチャンクを完全分離する。
// メモ画面は秘密URL(location.hash にトークン)で開かれるため、そのチャンクに
// amazon-cognito-identity-js 等の認証系コードを一切混入させない
// (エントリチャンクに静的 import があると /m でも読み込まれ、XSS 時の
//  トークン窃取の攻撃面と初期表示サイズが無駄に増える)。
// このファイルは auth / router / cognito を import してはならない。
const MemoScreen = lazy(() => import('./pages/MemoScreen'));
const AdminApp = lazy(() => import('./AdminApp'));

function PageLoader() {
  return (
    <div style={{ textAlign: 'center', padding: '96px 0', color: 'var(--muted)' }}>読み込み中…</div>
  );
}

export default function App() {
  const p = window.location.pathname;
  const isMemo = p === '/m' || p.startsWith('/m/');
  return (
    <Suspense fallback={<PageLoader />}>{isMemo ? <MemoScreen /> : <AdminApp />}</Suspense>
  );
}
