/**
 * uraneko ローカル管理GUI サーバ
 *
 * 公開 Web 管理画面は作らない方針のため、これは 127.0.0.1 のみにバインドする
 * ローカル専用ツール(ネットワークには一切晒さない)。CLI と同じ AWS 認証で
 * DynamoDB / S3 を直接操作し、実処理は scripts/lib/uraneko-store.mjs を共用する。
 *
 * 使い方:
 *   node scripts/uraneko-admin-server.mjs        # http://127.0.0.1:4173 を開く
 *   URANEKO_ADMIN_PORT=5000 node scripts/uraneko-admin-server.mjs
 *
 * 前提: AWS CLI / 環境変数で ap-northeast-1 に認証済み。
 */
import { createServer } from 'http';
import { readFileSync } from 'fs';
import * as store from './lib/uraneko-store.mjs';

const HOST = '127.0.0.1'; // ローカル専用。0.0.0.0 にはしない
const PORT = Number(process.env.URANEKO_ADMIN_PORT) || 4173;
const UI_HTML = new URL('./uraneko-admin-ui.html', import.meta.url);

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new store.ValidationError('リクエストボディが不正なJSONです'));
      }
    });
    req.on('error', reject);
  });
}

// ルート定義: method + pathname -> handler(query, body) -> 返り値を 200 JSON で返す
const routes = {
  'GET /api/bucket': async () => ({ bucket: store.assetsBucket() }),
  'GET /api/products': async (q) => store.listProducts({ all: q.get('all') === '1' }),
  'POST /api/products': async (_q, body) => store.putProduct(body),
  'POST /api/products/price': async (_q, body) => store.setPrice(body.product_id, Number(body.price_jpy)),
  'POST /api/products/publish': async (_q, body) => store.setPublished(body.product_id, Boolean(body.published)),
  'GET /api/tokens': async (q) => store.listTokens(q.get('product_id'), { all: q.get('all') === '1' }),
  'POST /api/tokens/backfill': async (_q, body) => store.backfillTokens({ dryRun: Boolean(body.dryRun) }),
  'POST /api/tokens/delete': async (_q, body) => store.deleteToken(body.token_id),
  'GET /api/orders': async () => store.listOrders(),
  'POST /api/orders/url': async (_q, body) => store.downloadUrlFor(body.order_id),
  'POST /api/ingest': async (_q, body) => {
    if (!body.file_path) throw new store.ValidationError('file_path(この PC 上の mp4 パス)が必要です');
    let fileBytes;
    try {
      fileBytes = readFileSync(body.file_path);
    } catch {
      throw new store.ValidationError(`ファイルが読めません: ${body.file_path}`);
    }
    const r = await store.ingest({
      product_id: body.product_id,
      fileBytes,
      bits: body.bits || undefined,
      token_id: body.token_id || undefined,
    });
    // 動画長を ffprobe で自動取得。商品の duration が未設定(0)なら埋める。
    // 投入(S3+トークン)は既に確定しているので、ここはベストエフォート(失敗しても投入成功を返す)。
    try {
      const dur = store.probeDurationSec(body.file_path);
      if (dur) {
        r.duration_sec = dur;
        const prod = await store.getProduct(body.product_id);
        if (prod && !prod.duration_sec) await store.setDuration(body.product_id, dur);
      }
    } catch {
      /* duration 自動セット失敗は投入本体に影響させない */
    }
    return r;
  },
  'GET /api/fs': async (q) => store.listDir(q.get('dir') || ''),
  'GET /api/preview-url': async (q) => ({ url: await store.previewUrl(q.get('key')) }),
  'GET /api/works': async (q) => store.scanWorks(q.get('dir') || '', q.get('product_id') || ''),
  'POST /api/products/thumbnail': async (_q, body) => {
    if (!body.file_path) throw new store.ValidationError('file_path(この PC 上の画像パス)が必要です');
    let fileBytes;
    try {
      fileBytes = readFileSync(body.file_path);
    } catch {
      throw new store.ValidationError(`ファイルが読めません: ${body.file_path}`);
    }
    const dot = body.file_path.lastIndexOf('.');
    const ext = dot >= 0 ? body.file_path.slice(dot) : '';
    return store.putThumbnail({ product_id: body.product_id, fileBytes, ext });
  },
  'GET /api/coupons': async (q) => store.listCoupons({ product: q.get('product') || undefined }),
  'POST /api/coupons': async (_q, body) => store.addCoupon(body),
  'POST /api/coupons/delete': async (_q, body) => store.deleteCoupon(body.coupon_code),
};

const server = createServer(async (req, res) => {
  // DNS リバインディング対策: Host が 127.0.0.1/localhost:PORT 以外なら拒否。
  // 127.0.0.1 バインドでも被害者ブラウザ経由の rebinding は防げないため Host を検証する。
  const host = (req.headers.host || '').toLowerCase();
  if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('forbidden host');
  }

  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const key = `${req.method} ${url.pathname}`;

  // UI
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    try {
      const html = readFileSync(UI_HTML);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    } catch {
      res.writeHead(500);
      return res.end('UI html not found');
    }
  }

  const handler = routes[key];
  if (!handler) return sendJson(res, 404, { error: 'not found' });

  try {
    const body = req.method === 'GET' ? {} : await readBody(req);
    const result = await handler(url.searchParams, body);
    sendJson(res, 200, result ?? { ok: true });
  } catch (err) {
    const isValidation = err instanceof store.ValidationError;
    if (!isValidation) console.error('admin-server error:', err);
    sendJson(res, isValidation ? 400 : 500, { error: err?.message ?? String(err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`uraneko ローカル管理GUI: http://${HOST}:${PORT}`);
  console.log('(このサーバは 127.0.0.1 のみで待受。ネットワークには公開されません)');
  console.log('停止: Ctrl+C');
});
