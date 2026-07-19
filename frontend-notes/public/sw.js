/* Stash Notes のメモ画面専用 Service Worker(scope: /m)。
 *
 * 【絶対規則】/api/* のレスポンスをキャッシュしない。メモAPIはトークンを POST body で
 * 受けるためリクエストURLが全利用者で同一であり、SW の HTTP キャッシュに載せると
 * 別の秘密URLのメモ内容が混線する。メモ内容のオフライン保存は IndexedDB
 * (lib/offline.ts、トークン別キー)だけが担当する。
 * ここでキャッシュするのは非機密のアプリシェル(HTML/ハッシュ付きアセット)のみ。
 */
const CACHE = 'notes-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // POST(メモAPI)は素通し
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // 念のため二重ガード

  // ページ本体(/m のシェル): network-first。オフライン時のみキャッシュで開く
  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(CACHE);
            cache.put('/m', res.clone());
          }
          return res;
        } catch {
          const cached = await caches.match('/m');
          return cached ?? new Response('offline', { status: 503 });
        }
      })(),
    );
    return;
  }

  // ハッシュ付きアセット・favicon 等: cache-first(不変ファイルなので安全)
  e.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    })(),
  );
});
