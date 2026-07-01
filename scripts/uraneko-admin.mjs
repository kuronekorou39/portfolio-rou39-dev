/**
 * uraneko 管理 CLI(価格・在庫・商品・トークンをローカルから操作する)
 *
 * 方針: uraneko には Web 管理画面を作らない(公開管理画面は攻撃面になるため)。
 *       商品/価格/在庫の運用はこの CLI から行う。書き込みはすべて DDB / S3 直。
 *
 * Usage:
 *   node scripts/uraneko-admin.mjs <command> [args]
 *
 * Commands:
 *   products list [--all]                商品一覧(--all で未公開含む)+ 在庫件数
 *   products get <product_id>            商品1件を表示
 *   products put --file <json>           商品を投入/更新(JSON ファイルから)
 *   products put --id <id> --title <t> --price <jpy> [--description <d>]
 *                [--duration <sec>] [--thumbnail <s3key>] [--source <s3key>]
 *                [--pool-target <n>] [--pool-threshold <n>] [--published]
 *   products set-price <product_id> <price_jpy>   価格を更新
 *   products publish <product_id> <true|false>    公開フラグを切替
 *   inventory [<product_id>]             在庫(未割当/割当トークン件数)を表示
 *   tokens list <product_id> [--all]     トークン一覧(既定は未割当のみ)
 *   tokens backfill [--dry-run]          status_created_at 欠落トークンを修復
 *   ingest --id <product_id> --file <local.mp4> [--bits <40bit>] [--token-id <uuid>]
 *                                        動画を S3 に置きトークンを1件投入(在庫+1)
 *
 * 前提:
 *   - AWS CLI / 環境変数で ap-northeast-1 に認証済み
 *   - backend/ に @aws-sdk/* がインストール済み
 *   - assets バケット名は URANEKO_ASSETS_BUCKET 環境変数、無ければ
 *     `aws sts get-caller-identity` からアカウントIDを引いて uraneko-assets-{account} を使う
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';

const require = createRequire(new URL('../backend/', import.meta.url).href);
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
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const REGION = 'ap-northeast-1';
const PRODUCTS_TABLE = 'uraneko-video-products';
const TOKENS_TABLE = 'uraneko-video-tokens';
const COUPONS_TABLE = 'uraneko-coupons';
const STATUS_GSI = 'by_product_status';
const PRODUCT_ID_RE = /^[a-z0-9-]+$/;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
let _s3;
function s3() {
  if (!_s3) _s3 = new S3Client({ region: REGION });
  return _s3;
}

function assetsBucket() {
  if (process.env.URANEKO_ASSETS_BUCKET) return process.env.URANEKO_ASSETS_BUCKET;
  const account = execSync('aws sts get-caller-identity --query Account --output text', {
    encoding: 'utf8',
  }).trim();
  return `uraneko-assets-${account}`;
}

// --- 簡易フラグパーサ(--key value / --flag) ---
function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

// --- 在庫件数(未割当/割当)を GSI COUNT で数える ---
async function countByStatus(product_id, statusPrefix) {
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

async function inventoryOf(product_id) {
  const [unassigned, assigned] = await Promise.all([
    countByStatus(product_id, 'unassigned#'),
    countByStatus(product_id, 'assigned#'),
  ]);
  return { unassigned, assigned };
}

async function getProduct(product_id) {
  const res = await ddb.send(new GetCommand({ TableName: PRODUCTS_TABLE, Key: { product_id } }));
  return res.Item;
}

// --- products ---
async function productsList(flags) {
  const res = await ddb.send(new ScanCommand({ TableName: PRODUCTS_TABLE }));
  let items = res.Items ?? [];
  if (!flags.all) items = items.filter((p) => p.published);
  items.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  if (items.length === 0) {
    console.log('(商品なし)');
    return;
  }
  for (const p of items) {
    const inv = await inventoryOf(p.product_id);
    const pub = p.published ? '公開' : '非公開';
    console.log(
      `${p.product_id}  ¥${p.price_jpy}  [${pub}]  在庫(未割当)=${inv.unassigned} 販売済=${inv.assigned}  ${p.title}`,
    );
  }
}

async function productsGet(positional) {
  const product_id = positional[0];
  if (!product_id) die('usage: products get <product_id>');
  const p = await getProduct(product_id);
  if (!p) die(`product not found: ${product_id}`);
  const inv = await inventoryOf(product_id);
  console.log(JSON.stringify({ ...p, _inventory: inv }, null, 2));
}

function buildProductFromFlags(flags) {
  if (!flags.id) die('--id required');
  if (!PRODUCT_ID_RE.test(flags.id)) die('--id must match [a-z0-9-]+');
  if (flags.price === undefined) die('--price required');
  const price = Number(flags.price);
  if (!Number.isInteger(price) || price < 0) die('--price must be a non-negative integer (JPY)');
  return {
    product_id: flags.id,
    title: flags.title ?? flags.id,
    description: flags.description ?? '',
    price_jpy: price,
    duration_sec: flags.duration !== undefined ? Number(flags.duration) : 0,
    thumbnail_s3_key: flags.thumbnail ?? '',
    source_s3_key: flags.source ?? '',
    pool_target: flags['pool-target'] !== undefined ? Number(flags['pool-target']) : 0,
    pool_threshold: flags['pool-threshold'] !== undefined ? Number(flags['pool-threshold']) : 0,
    published: Boolean(flags.published), // 既定 false。明示的に --published で公開
    created_at: new Date().toISOString(),
  };
}

async function productsPut(flags) {
  let item;
  if (flags.file) {
    item = JSON.parse(readFileSync(flags.file, 'utf-8'));
    if (!item.product_id || !PRODUCT_ID_RE.test(item.product_id)) {
      die('file: product_id missing or invalid ([a-z0-9-]+)');
    }
    if (!Number.isInteger(item.price_jpy) || item.price_jpy < 0) {
      die('file: price_jpy must be a non-negative integer');
    }
    if (typeof item.published !== 'boolean') item.published = false;
    if (!item.created_at) item.created_at = new Date().toISOString();
  } else {
    item = buildProductFromFlags(flags);
  }
  // 既存の created_at は温存(更新時に公開日をリセットしない)
  const existing = await getProduct(item.product_id);
  if (existing?.created_at) item.created_at = existing.created_at;
  await ddb.send(new PutCommand({ TableName: PRODUCTS_TABLE, Item: item }));
  console.log(`[OK] put product ${item.product_id} (¥${item.price_jpy}, ${item.published ? '公開' : '非公開'})`);
}

async function productsSetPrice(positional) {
  const [product_id, priceStr] = positional;
  if (!product_id || priceStr === undefined) die('usage: products set-price <product_id> <price_jpy>');
  const price = Number(priceStr);
  if (!Number.isInteger(price) || price < 0) die('price must be a non-negative integer (JPY)');
  if (!(await getProduct(product_id))) die(`product not found: ${product_id}`);
  await ddb.send(
    new UpdateCommand({
      TableName: PRODUCTS_TABLE,
      Key: { product_id },
      UpdateExpression: 'SET price_jpy = :p',
      ExpressionAttributeValues: { ':p': price },
    }),
  );
  console.log(`[OK] ${product_id} price -> ¥${price}(次回チェックアウトから即反映)`);
}

async function productsPublish(positional) {
  const [product_id, valStr] = positional;
  if (!product_id || valStr === undefined) die('usage: products publish <product_id> <true|false>');
  if (valStr !== 'true' && valStr !== 'false') die('value must be true or false');
  const published = valStr === 'true';
  if (!(await getProduct(product_id))) die(`product not found: ${product_id}`);
  await ddb.send(
    new UpdateCommand({
      TableName: PRODUCTS_TABLE,
      Key: { product_id },
      UpdateExpression: 'SET published = :v',
      ExpressionAttributeValues: { ':v': published },
    }),
  );
  console.log(`[OK] ${product_id} published -> ${published}`);
}

// --- inventory ---
async function inventoryCmd(positional) {
  if (positional[0]) {
    const inv = await inventoryOf(positional[0]);
    console.log(`${positional[0]}  未割当(在庫)=${inv.unassigned}  販売済=${inv.assigned}`);
    return;
  }
  const res = await ddb.send(new ScanCommand({ TableName: PRODUCTS_TABLE }));
  for (const p of res.Items ?? []) {
    const inv = await inventoryOf(p.product_id);
    console.log(`${p.product_id}  未割当(在庫)=${inv.unassigned}  販売済=${inv.assigned}`);
  }
}

// --- tokens ---
async function tokensList(positional, flags) {
  const product_id = positional[0];
  if (!product_id) die('usage: tokens list <product_id> [--all]');
  const prefix = flags.all ? undefined : 'unassigned#';
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
  for (const t of res.Items ?? []) {
    console.log(`${t.token_id}  ${t.status}  ${t.s3_key}  order=${t.order_id ?? '-'}`);
  }
  console.log(`(${res.Items?.length ?? 0} 件)`);
}

// status_created_at 欠落トークンの修復(Step1 バックフィル)
async function tokensBackfill(flags) {
  const dryRun = Boolean(flags['dry-run']);
  let scanned = 0;
  let fixed = 0;
  let ExclusiveStartKey;
  do {
    const res = await ddb.send(new ScanCommand({ TableName: TOKENS_TABLE, ExclusiveStartKey }));
    for (const t of res.Items ?? []) {
      scanned++;
      if (t.status_created_at) continue; // 既に正常
      const status = t.status ?? 'unassigned';
      const createdAt = t.created_at ?? new Date().toISOString();
      const sca = `${status}#${createdAt}`;
      if (dryRun) {
        console.log(`[DRY] ${t.token_id} -> status_created_at=${sca}`);
        fixed++;
        continue;
      }
      // attribute_not_exists で冪等に(既に埋まっていれば触らない)
      await ddb.send(
        new UpdateCommand({
          TableName: TOKENS_TABLE,
          Key: { token_id: t.token_id },
          ConditionExpression: 'attribute_not_exists(status_created_at)',
          UpdateExpression: 'SET status_created_at = :sca',
          ExpressionAttributeValues: { ':sca': sca },
        }),
      );
      console.log(`[FIX] ${t.token_id} -> status_created_at=${sca}`);
      fixed++;
    }
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  console.log(`\nscanned=${scanned} ${dryRun ? 'would-fix' : 'fixed'}=${fixed}`);
}

// --- ingest: 動画を S3 に置いてトークンを1件投入(在庫+1) ---
function randomBits(n = 40) {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.round(Math.random()); // テスト用途。本番は ghost-code が採番
  return s;
}

async function ingest(flags) {
  const product_id = flags.id;
  const file = flags.file;
  if (!product_id) die('--id <product_id> required');
  if (!PRODUCT_ID_RE.test(product_id)) die('--id must match [a-z0-9-]+');
  if (!file) die('--file <local.mp4> required');

  const product = await getProduct(product_id);
  if (!product) die(`product not found: ${product_id}(先に products put で作成してください)`);

  const bits = flags.bits ?? randomBits();
  if (!/^[01]{40}$/.test(bits)) die('--bits must be 40 chars of 0/1');
  const token_id = flags['token-id'] ?? randomUUID();
  const s3_key = `videos/${product_id}/${token_id}.mp4`;
  const bucket = assetsBucket();
  const created_at = new Date().toISOString();

  // 契約の書込順序を厳守: 1) S3 PutObject -> 2) DDB PutItem
  const bodyBytes = readFileSync(file);
  await s3().send(
    new PutObjectCommand({ Bucket: bucket, Key: s3_key, Body: bodyBytes, ContentType: 'video/mp4' }),
  );
  console.log(`[S3] put s3://${bucket}/${s3_key} (${bodyBytes.length} bytes)`);

  const token = {
    token_id,
    product_id,
    s3_key,
    bits,
    status: 'unassigned',
    status_created_at: `unassigned#${created_at}`, // GSI SK 必須
    assigned_to: null,
    assigned_at: null,
    order_id: null,
    created_at,
  };
  // token_id 衝突時は上書きしない
  await ddb.send(
    new PutCommand({
      TableName: TOKENS_TABLE,
      Item: token,
      ConditionExpression: 'attribute_not_exists(token_id)',
    }),
  );
  console.log(`[DDB] token ${token_id} for ${product_id} (在庫+1)`);
}

const USAGE = `uraneko 管理 CLI
  node scripts/uraneko-admin.mjs <command> [args]

  products list [--all]                          商品一覧(--all で未公開含む)+ 在庫件数
  products get <product_id>                      商品1件を表示
  products put --file <json>                     商品を投入/更新(JSON ファイル)
  products put --id <id> --price <jpy> [--title <t>] [--description <d>]
               [--duration <sec>] [--thumbnail <s3key>] [--source <s3key>]
               [--pool-target <n>] [--pool-threshold <n>] [--published]
  products set-price <product_id> <price_jpy>    価格を更新
  products publish <product_id> <true|false>     公開フラグを切替
  inventory [<product_id>]                        在庫(未割当/割当)を表示
  tokens list <product_id> [--all]               トークン一覧(既定は未割当のみ)
  tokens backfill [--dry-run]                     status_created_at 欠落トークンを修復
  ingest --id <product_id> --file <local.mp4> [--bits <40bit>] [--token-id <uuid>]
                                                 動画を S3 に置きトークンを1件投入(在庫+1)
  coupons add --code <c> --product <pid> --percent <1-100> --max <n> [--expires <iso>]
                                                 クーポン発行(特定商品限定・総利用上限)
  coupons list [--product <pid>]                 クーポン一覧
  coupons get <coupon_code>                       クーポン1件を表示
  coupons delete <coupon_code>                    クーポン削除`;

// --- coupons(特定商品限定・総利用上限のみ) ---
async function couponsAdd(flags) {
  const product_id = flags.product;
  if (!product_id) die('--product <product_id> required');
  if (!PRODUCT_ID_RE.test(product_id)) die('--product must match [a-z0-9-]+');
  const percent = Number(flags.percent);
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) die('--percent must be 1..100');
  const max = Number(flags.max);
  if (!Number.isInteger(max) || max < 1) die('--max must be a positive integer');
  if (!(await getProduct(product_id))) die(`product not found: ${product_id}(先に products put で作成してください)`);

  // コードはベアラーシークレット(当たれば誰でも適用可)。未指定なら 128bit を自動生成。
  let code = flags.code;
  if (!code || code === true) {
    code = randomUUID().replace(/-/g, '');
    console.log(`(--code 未指定 → 自動生成: ${code})`);
  }
  // 100%(無料配布)クーポンは特に総当たり耐性が要るので短いコードを禁止。
  if (percent === 100 && String(code).length < 16) {
    die('100% クーポンは推測困難な長いコードが必須です(--code 16文字以上、または --code 省略で自動生成)');
  }

  const item = {
    coupon_code: code,
    product_id,
    discount_percent: percent,
    max_redemptions: max,
    redeemed_count: 0,
    created_at: new Date().toISOString(),
  };
  // 無期限なら属性を持たせない(NULL は書かない: 予約の条件式が壊れるため)
  if (flags.expires) {
    if (flags.expires === true) die('--expires にはISO8601日時を指定してください(例: 2026-12-31T23:59:59.000Z)');
    if (Number.isNaN(Date.parse(flags.expires))) die(`--expires を日時として解釈できません: ${flags.expires}`);
    item.expires_at = flags.expires;
  }

  await ddb.send(
    new PutCommand({
      TableName: COUPONS_TABLE,
      Item: item,
      ConditionExpression: 'attribute_not_exists(coupon_code)',
    }),
  );
  console.log(
    `[OK] coupon ${code}: ${percent}% off ${product_id} (max ${max}${item.expires_at ? `, expires ${item.expires_at}` : ''})`,
  );
}

async function couponsList(flags) {
  const res = await ddb.send(new ScanCommand({ TableName: COUPONS_TABLE }));
  let items = res.Items ?? [];
  if (flags.product) items = items.filter((c) => c.product_id === flags.product);
  if (items.length === 0) {
    console.log('(クーポンなし)');
    return;
  }
  for (const c of items) {
    console.log(
      `${c.coupon_code}  ${c.discount_percent}%  ${c.product_id}  利用 ${c.redeemed_count}/${c.max_redemptions}  expires=${c.expires_at ?? '-'}`,
    );
  }
}

async function couponsGet(positional) {
  const code = positional[0];
  if (!code) die('usage: coupons get <coupon_code>');
  const res = await ddb.send(new GetCommand({ TableName: COUPONS_TABLE, Key: { coupon_code: code } }));
  if (!res.Item) die(`coupon not found: ${code}`);
  console.log(JSON.stringify(res.Item, null, 2));
}

async function couponsDelete(positional) {
  const code = positional[0];
  if (!code) die('usage: coupons delete <coupon_code>');
  await ddb.send(new DeleteCommand({ TableName: COUPONS_TABLE, Key: { coupon_code: code } }));
  console.log(`[OK] deleted coupon ${code}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const group = argv[0];
  const sub = argv[1];

  try {
    switch (group) {
      case 'products': {
        const { positional, flags } = parseArgs(argv.slice(2));
        if (sub === 'list') return await productsList(flags);
        if (sub === 'get') return await productsGet(positional);
        if (sub === 'put') return await productsPut(flags);
        if (sub === 'set-price') return await productsSetPrice(positional);
        if (sub === 'publish') return await productsPublish(positional);
        return die('products: unknown subcommand (list|get|put|set-price|publish)');
      }
      case 'inventory': {
        const { positional } = parseArgs(argv.slice(1));
        return await inventoryCmd(positional);
      }
      case 'tokens': {
        const { positional, flags } = parseArgs(argv.slice(2));
        if (sub === 'list') return await tokensList(positional, flags);
        if (sub === 'backfill') return await tokensBackfill(flags);
        return die('tokens: unknown subcommand (list|backfill)');
      }
      case 'ingest': {
        const { flags } = parseArgs(argv.slice(1));
        return await ingest(flags);
      }
      case 'coupons': {
        const { positional, flags } = parseArgs(argv.slice(2));
        if (sub === 'add') return await couponsAdd(flags);
        if (sub === 'list') return await couponsList(flags);
        if (sub === 'get') return await couponsGet(positional);
        if (sub === 'delete') return await couponsDelete(positional);
        return die('coupons: unknown subcommand (add|list|get|delete)');
      }
      default:
        console.log(USAGE);
        process.exit(group ? 1 : 0);
    }
  } catch (err) {
    die(err?.message ?? String(err));
  }
}

main();
