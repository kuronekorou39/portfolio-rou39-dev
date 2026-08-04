/**
 * アクセス解析 ローカル GUI サーバ
 *
 * CloudFront のアクセスログ(S3)を集計してブラウザで見るだけのローカル専用ツール。
 * IP や User-Agent を表示するので、公開 Web には置かず 127.0.0.1 のみにバインドする。
 *
 * 使い方:
 *   node scripts/access/access-server.mjs         # http://127.0.0.1:4174 を開く
 *   ACCESS_UI_PORT=5000 node scripts/access/access-server.mjs
 *
 * 前提: AWS CLI / 環境変数で ap-northeast-1 に認証済み。
 * uraneko の管理 GUI (4173) とはポートが別なので同時に起動できる。
 */
import { createServer } from 'http';
import { readFileSync } from 'fs';
import * as core from '../lib/cf-access-stats.mjs';

const HOST = '127.0.0.1'; // ローカル専用。0.0.0.0 にはしない
const PORT = Number(process.env.ACCESS_UI_PORT) || 4174;
const UI_HTML = new URL('./access-ui.html', import.meta.url);

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

const routes = {
  'GET /api/sites': async () =>
    Object.values(core.SITES).map((s) => ({ key: s.key, label: s.label })),
  'GET /api/stats': async (q) =>
    core.statsToJSON(
      await core.collect({
        site: q.get('site') || 'rou39',
        days: Math.max(1, Number(q.get('days')) || 7),
      })
    ),
};

const server = createServer(async (req, res) => {
  // DNS リバインディング対策: Host が 127.0.0.1/localhost:PORT 以外なら拒否。
  // 127.0.0.1 バインドでも被害者ブラウザ経由の rebinding は防げないため Host を検証する。
  const host = (req.headers.host || '').toLowerCase();
  if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('forbidden host');
  }

  // CSRF 対策: 悪意サイトからの fetch は宛先が 127.0.0.1 でも Origin にそのサイトが乗る。
  // Origin 無し(curl / 同一オリジンのナビゲーション)か自分自身のみ許可する。
  const origin = (req.headers.origin || '').toLowerCase();
  if (origin && origin !== `http://127.0.0.1:${PORT}` && origin !== `http://localhost:${PORT}`) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('forbidden origin');
  }

  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    try {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(readFileSync(UI_HTML));
    } catch {
      res.writeHead(500);
      return res.end('UI html not found');
    }
  }

  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) return sendJson(res, 404, { error: 'not found' });

  try {
    sendJson(res, 200, await handler(url.searchParams));
  } catch (err) {
    console.error('access-server error:', err);
    sendJson(res, 500, { error: err?.message ?? String(err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`アクセス解析 ローカル GUI: http://${HOST}:${PORT}`);
  console.log('(このサーバは 127.0.0.1 のみで待受。ネットワークには公開されません)');
  console.log('停止: Ctrl+C');
});
