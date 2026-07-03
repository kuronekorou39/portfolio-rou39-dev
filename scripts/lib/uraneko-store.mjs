/**
 * uraneko 在庫/商品/クーポン操作の共通ストア。
 * CLI(uraneko-admin.mjs)とローカル管理GUI(uraneko-admin-server.mjs)の両方から使う。
 *
 * すべて DDB / S3 直操作。AWS CLI / 環境変数の認証情報を使用(ap-northeast-1)。
 * バリデーション失敗は ValidationError を throw する(呼び出し側で 400 / die に変換)。
 */
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { randomUUID, createHmac } from 'crypto';

const require = createRequire(new URL('../../backend/', import.meta.url).href);
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

export const REGION = 'ap-northeast-1';
export const PRODUCTS_TABLE = 'uraneko-video-products';
export const TOKENS_TABLE = 'uraneko-video-tokens';
export const ORDERS_TABLE = 'uraneko-orders';
export const COUPONS_TABLE = 'uraneko-coupons';
export const STATUS_GSI = 'by_product_status';
export const PRODUCT_ID_RE = /^[a-z0-9-]+$/;
// 発行URL(署名DLリンク)再現用。backend の secrets-stack / order-token.ts と一致させること。
export const ORDER_ACCESS_SECRET_NAME = 'uraneko/order-access-secret';
export const SITE_BASE_URL = 'https://uraneko.rou39.com';
const ORDER_TOKEN_TTL_SEC = 60 * 60 * 24 * 30; // order-token.ts と同じ 30 日

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
let _s3;
function s3() {
  if (!_s3) _s3 = new S3Client({ region: REGION });
  return _s3;
}
let _sm;
function sm() {
  if (!_sm) _sm = new SecretsManagerClient({ region: REGION });
  return _sm;
}
let _orderSecret;
async function orderAccessSecret() {
  if (_orderSecret) return _orderSecret;
  const res = await sm().send(new GetSecretValueCommand({ SecretId: ORDER_ACCESS_SECRET_NAME }));
  if (!res.SecretString) invalid(`${ORDER_ACCESS_SECRET_NAME} が未設定です`);
  _orderSecret = res.SecretString;
  return _orderSecret;
}

let _bucket;
export function assetsBucket() {
  if (process.env.URANEKO_ASSETS_BUCKET) return process.env.URANEKO_ASSETS_BUCKET;
  if (_bucket) return _bucket;
  const account = execSync('aws sts get-caller-identity --query Account --output text', {
    encoding: 'utf8',
  }).trim();
  _bucket = `uraneko-assets-${account}`;
  return _bucket;
}

export class ValidationError extends Error {}
function invalid(msg) {
  throw new ValidationError(msg);
}

// --- 在庫件数(未割当/割当)を GSI COUNT で数える ---
export async function countByStatus(product_id, statusPrefix) {
  let count = 0;
  let ExclusiveStartKey;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TOKENS_TABLE,
        IndexName: STATUS_GSI,
        KeyConditionExpression: 'product_id = :pid AND begins_with(status_created_at, :prefix)',
        ExpressionAttributeValues: { ':pid': product_id, ':prefix': statusPrefix },
        Select: 'COUNT',
        ExclusiveStartKey,
      }),
    );
    count += res.Count ?? 0;
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return count;
}

export async function inventoryOf(product_id) {
  const [unassigned, assigned] = await Promise.all([
    countByStatus(product_id, 'unassigned#'),
    countByStatus(product_id, 'assigned#'),
  ]);
  return { unassigned, assigned };
}

export async function getProduct(product_id) {
  const res = await ddb.send(new GetCommand({ TableName: PRODUCTS_TABLE, Key: { product_id } }));
  return res.Item ?? null;
}

// 商品一覧 + 在庫件数。all=false なら公開のみ。
export async function listProducts({ all = false } = {}) {
  const res = await ddb.send(new ScanCommand({ TableName: PRODUCTS_TABLE }));
  let items = res.Items ?? [];
  if (!all) items = items.filter((p) => p.published);
  items.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return Promise.all(items.map(async (p) => ({ ...p, inventory: await inventoryOf(p.product_id) })));
}

// 商品を投入/更新。既存の created_at・サムネ・source・pool 設定は
// 入力に無ければ温存する(GUI の編集フォームがこれらを送らずに上書き消去するのを防ぐ)。
export async function putProduct(input) {
  const product_id = String(input.product_id ?? '');
  if (!PRODUCT_ID_RE.test(product_id)) invalid('product_id は [a-z0-9-]+ である必要があります');
  const price = Number(input.price_jpy);
  if (!Number.isInteger(price) || price < 0) invalid('price_jpy は 0 以上の整数(円)である必要があります');
  // thumbnail_s3_key は公開APIが presign する。videos/ 等を紛れ込ませないよう prefix を強制。
  if (input.thumbnail_s3_key && !String(input.thumbnail_s3_key).startsWith('thumbnails/')) {
    invalid('thumbnail_s3_key は thumbnails/ で始まる必要があります');
  }

  const existing = await getProduct(product_id);
  // 入力に無いフィールドは既存値を温存する(部分更新で他フィールドを消さない)。
  const item = {
    product_id,
    title: input.title ?? existing?.title ?? product_id,
    description: input.description ?? existing?.description ?? '',
    price_jpy: price,
    duration_sec: Number.isFinite(Number(input.duration_sec))
      ? Number(input.duration_sec)
      : existing?.duration_sec ?? 0,
    thumbnail_s3_key: input.thumbnail_s3_key ?? existing?.thumbnail_s3_key ?? '',
    source_s3_key: input.source_s3_key ?? existing?.source_s3_key ?? '',
    pool_target: Number.isFinite(Number(input.pool_target))
      ? Number(input.pool_target)
      : existing?.pool_target ?? 0,
    pool_threshold: Number.isFinite(Number(input.pool_threshold))
      ? Number(input.pool_threshold)
      : existing?.pool_threshold ?? 0,
    published: input.published !== undefined ? Boolean(input.published) : existing?.published ?? false,
    created_at: existing?.created_at ?? new Date().toISOString(),
  };
  await ddb.send(new PutCommand({ TableName: PRODUCTS_TABLE, Item: item }));
  return item;
}

// 対応するサムネ画像の拡張子 → Content-Type
const THUMB_CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

// サムネ画像を S3 に置き、商品の thumbnail_s3_key を更新する。
// 契約の書込順序は動画と同じく S3 → DDB。key は thumbnails/<product_id><ext>。
export async function putThumbnail({ product_id, fileBytes, ext }) {
  if (!PRODUCT_ID_RE.test(String(product_id ?? ''))) invalid('product_id は [a-z0-9-]+');
  if (!fileBytes || !fileBytes.length) invalid('画像ファイルの内容が空です');
  const e = String(ext ?? '').toLowerCase();
  const contentType = THUMB_CONTENT_TYPES[e];
  if (!contentType) invalid('画像は .jpg / .jpeg / .png / .webp のみ対応');
  if (!(await getProduct(product_id))) {
    invalid(`product not found: ${product_id}(先に商品を作成してください)`);
  }

  const s3_key = `thumbnails/${product_id}${e}`;
  const bucket = assetsBucket();
  await s3().send(
    new PutObjectCommand({ Bucket: bucket, Key: s3_key, Body: fileBytes, ContentType: contentType }),
  );
  await ddb.send(
    new UpdateCommand({
      TableName: PRODUCTS_TABLE,
      Key: { product_id },
      UpdateExpression: 'SET thumbnail_s3_key = :k',
      ExpressionAttributeValues: { ':k': s3_key },
    }),
  );
  return { product_id, thumbnail_s3_key: s3_key, bucket, bytes: fileBytes.length };
}

export async function setPrice(product_id, price_jpy) {
  const price = Number(price_jpy);
  if (!Number.isInteger(price) || price < 0) invalid('price_jpy は 0 以上の整数(円)である必要があります');
  if (!(await getProduct(product_id))) invalid(`product not found: ${product_id}`);
  await ddb.send(
    new UpdateCommand({
      TableName: PRODUCTS_TABLE,
      Key: { product_id },
      UpdateExpression: 'SET price_jpy = :p',
      ExpressionAttributeValues: { ':p': price },
    }),
  );
  return { product_id, price_jpy: price };
}

export async function setPublished(product_id, published) {
  if (typeof published !== 'boolean') invalid('published は boolean');
  if (!(await getProduct(product_id))) invalid(`product not found: ${product_id}`);
  await ddb.send(
    new UpdateCommand({
      TableName: PRODUCTS_TABLE,
      Key: { product_id },
      UpdateExpression: 'SET published = :v',
      ExpressionAttributeValues: { ':v': published },
    }),
  );
  return { product_id, published };
}

export async function listTokens(product_id, { all = false } = {}) {
  if (!product_id) invalid('product_id required');
  const prefix = all ? undefined : 'unassigned#';
  const res = await ddb.send(
    new QueryCommand({
      TableName: TOKENS_TABLE,
      IndexName: STATUS_GSI,
      KeyConditionExpression: prefix
        ? 'product_id = :pid AND begins_with(status_created_at, :prefix)'
        : 'product_id = :pid',
      ExpressionAttributeValues: prefix ? { ':pid': product_id, ':prefix': prefix } : { ':pid': product_id },
    }),
  );
  return res.Items ?? [];
}

// status_created_at 欠落トークンの修復(Step1 バックフィル)
export async function backfillTokens({ dryRun = false } = {}) {
  let scanned = 0;
  const fixedList = [];
  let ExclusiveStartKey;
  do {
    const res = await ddb.send(new ScanCommand({ TableName: TOKENS_TABLE, ExclusiveStartKey }));
    for (const t of res.Items ?? []) {
      scanned++;
      if (t.status_created_at) continue;
      const status = t.status ?? 'unassigned';
      const createdAt = t.created_at ?? new Date().toISOString();
      const sca = `${status}#${createdAt}`;
      if (!dryRun) {
        await ddb.send(
          new UpdateCommand({
            TableName: TOKENS_TABLE,
            Key: { token_id: t.token_id },
            ConditionExpression: 'attribute_not_exists(status_created_at)',
            UpdateExpression: 'SET status_created_at = :sca',
            ExpressionAttributeValues: { ':sca': sca },
          }),
        );
      }
      fixedList.push({ token_id: t.token_id, status_created_at: sca });
    }
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return { scanned, fixed: fixedList.length, dryRun, details: fixedList };
}

function randomBits(n = 40) {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.round(Math.random()); // テスト用途。本番は ghost-code が採番
  return s;
}

// 動画バイト列を S3 に置きトークンを1件投入(在庫+1)。契約の書込順序 S3→DDB を厳守。
export async function ingest({ product_id, fileBytes, bits, token_id }) {
  if (!PRODUCT_ID_RE.test(String(product_id ?? ''))) invalid('product_id は [a-z0-9-]+');
  if (!fileBytes || !fileBytes.length) invalid('動画ファイルの内容が空です');
  const product = await getProduct(product_id);
  if (!product) invalid(`product not found: ${product_id}(先に商品を作成してください)`);

  const useBits = bits ?? randomBits();
  if (!/^[01]{40}$/.test(useBits)) invalid('bits は 40 文字の 0/1');
  const tid = token_id || randomUUID();
  const s3_key = `videos/${product_id}/${tid}.mp4`;
  const bucket = assetsBucket();
  const created_at = new Date().toISOString();

  await s3().send(
    new PutObjectCommand({ Bucket: bucket, Key: s3_key, Body: fileBytes, ContentType: 'video/mp4' }),
  );

  const token = {
    token_id: tid,
    product_id,
    s3_key,
    bits: useBits,
    status: 'unassigned',
    status_created_at: `unassigned#${created_at}`,
    assigned_to: null,
    assigned_at: null,
    order_id: null,
    created_at,
  };
  await ddb.send(
    new PutCommand({
      TableName: TOKENS_TABLE,
      Item: token,
      ConditionExpression: 'attribute_not_exists(token_id)',
    }),
  );
  return { token_id: tid, s3_key, bucket, bytes: fileBytes.length };
}

// --- coupons(特定商品限定・総利用上限のみ) ---
export async function listCoupons({ product } = {}) {
  const res = await ddb.send(new ScanCommand({ TableName: COUPONS_TABLE }));
  let items = res.Items ?? [];
  if (product) items = items.filter((c) => c.product_id === product);
  return items;
}

export async function getCouponRec(coupon_code) {
  const res = await ddb.send(new GetCommand({ TableName: COUPONS_TABLE, Key: { coupon_code } }));
  return res.Item ?? null;
}

export async function addCoupon(input) {
  const product_id = String(input.product_id ?? '');
  if (!PRODUCT_ID_RE.test(product_id)) invalid('product は [a-z0-9-]+');
  const percent = Number(input.discount_percent);
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) invalid('割引率は 1..100');
  const max = Number(input.max_redemptions);
  if (!Number.isInteger(max) || max < 1) invalid('利用上限は 1 以上の整数');
  if (!(await getProduct(product_id))) invalid(`product not found: ${product_id}`);

  // コードはベアラーシークレット。未指定なら 128bit 自動生成。
  let code = input.coupon_code;
  if (!code || code === true) code = randomUUID().replace(/-/g, '');
  code = String(code);
  if (percent === 100 && code.length < 16) {
    invalid('100% クーポンは推測困難な長いコードが必須です(16文字以上、または未指定で自動生成)');
  }

  const item = {
    coupon_code: code,
    product_id,
    discount_percent: percent,
    max_redemptions: max,
    redeemed_count: 0,
    created_at: new Date().toISOString(),
  };
  if (input.expires_at) {
    if (input.expires_at === true) invalid('expires_at にはISO8601日時を指定してください');
    if (Number.isNaN(Date.parse(input.expires_at))) invalid(`expires_at を日時として解釈できません: ${input.expires_at}`);
    item.expires_at = String(input.expires_at); // 無期限なら属性を持たせない
  }
  await ddb.send(
    new PutCommand({
      TableName: COUPONS_TABLE,
      Item: item,
      ConditionExpression: 'attribute_not_exists(coupon_code)',
    }),
  );
  return item;
}

export async function deleteCoupon(coupon_code) {
  if (!coupon_code) invalid('coupon_code required');
  await ddb.send(new DeleteCommand({ TableName: COUPONS_TABLE, Key: { coupon_code } }));
  return { coupon_code, deleted: true };
}

// --- orders(購入・発行の紐づけ一覧) ---

// 全注文を新しい順で返す。注文レコードに token_id / email / coupon_code / 金額が
// 含まれるので、これ自体が「注文 - 動画トークン - 購入者 - クーポン」の紐づけになる。
export async function listOrders() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await ddb.send(new ScanCommand({ TableName: ORDERS_TABLE, ExclusiveStartKey }));
    items.push(...(res.Items ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return items;
}

/**
 * 購入者に発行された署名付きダウンロードURLを再生成する。
 * backend/src/lib/uraneko/order-token.ts と同一形式(<order_id>.<exp>.<hmac>)。
 * メール紛失時の再発行や、管理画面での確認に使う。
 */
export async function downloadUrlFor(order_id) {
  if (!order_id) invalid('order_id required');
  const order = (await ddb.send(new GetCommand({ TableName: ORDERS_TABLE, Key: { order_id } }))).Item;
  if (!order) invalid(`order not found: ${order_id}`);
  const secret = await orderAccessSecret();
  const exp = Math.floor(Date.now() / 1000) + ORDER_TOKEN_TTL_SEC;
  const payload = `${order_id}.${exp}`;
  const mac = createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
  const token = `${payload}.${mac}`;
  return {
    order_id,
    status: order.status,
    url: `${SITE_BASE_URL}/order/${order_id}/complete?token=${token}`,
    expires_at: new Date(exp * 1000).toISOString(),
  };
}

/**
 * 未割当トークンを1件削除する(DDB + S3 の動画本体)。テストトークンの入れ替え用。
 * 販売済み(assigned)は購入者のDLを壊すので削除不可。
 */
export async function deleteToken(token_id) {
  if (!token_id) invalid('token_id required');
  const cur = (await ddb.send(new GetCommand({ TableName: TOKENS_TABLE, Key: { token_id } }))).Item;
  if (!cur) invalid(`token not found: ${token_id}`);
  if (cur.status !== 'unassigned') {
    invalid('販売済み(assigned)のトークンは削除できません(購入者のダウンロードが壊れます)');
  }
  // 先に DDB を条件付きで消してから S3。未割当のまま消せた場合のみ実体を消す。
  await ddb.send(
    new DeleteCommand({
      TableName: TOKENS_TABLE,
      Key: { token_id },
      ConditionExpression: '#s = :u',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':u': 'unassigned' },
    }),
  );
  if (cur.s3_key) {
    await s3().send(new DeleteObjectCommand({ Bucket: assetsBucket(), Key: cur.s3_key }));
  }
  return { token_id, deleted: true, s3_key: cur.s3_key ?? null };
}
