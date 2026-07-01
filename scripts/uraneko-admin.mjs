/**
 * uraneko 管理 CLI(価格・在庫・商品・トークン・クーポンをローカルから操作)
 *
 * 方針: uraneko には Web 管理画面を作らない(公開管理画面は攻撃面になるため)。
 *       運用はこの CLI か、ローカル専用GUI(uraneko-admin-server.mjs)から行う。
 *       実処理は scripts/lib/uraneko-store.mjs に集約(CLI/GUI 共通)。
 *
 * Usage:
 *   node scripts/uraneko-admin.mjs <command> [args]
 *
 * 前提: AWS CLI / 環境変数で ap-northeast-1 に認証済み。backend/ に @aws-sdk/* あり。
 *       assets バケットは URANEKO_ASSETS_BUCKET 環境変数、無ければ STS からアカウントIDを引く。
 */
import { readFileSync } from 'fs';
import * as store from './lib/uraneko-store.mjs';

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
  coupons delete <coupon_code>                    クーポン削除

  ヒント: GUI で操作したい場合は  node scripts/uraneko-admin-server.mjs`;

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

async function productsList(flags) {
  const items = await store.listProducts({ all: Boolean(flags.all) });
  if (items.length === 0) return console.log('(商品なし)');
  for (const p of items) {
    const pub = p.published ? '公開' : '非公開';
    console.log(
      `${p.product_id}  ¥${p.price_jpy}  [${pub}]  在庫(未割当)=${p.inventory.unassigned} 販売済=${p.inventory.assigned}  ${p.title}`,
    );
  }
}

async function productsGet(positional) {
  const product_id = positional[0];
  if (!product_id) die('usage: products get <product_id>');
  const p = await store.getProduct(product_id);
  if (!p) die(`product not found: ${product_id}`);
  const inv = await store.inventoryOf(product_id);
  console.log(JSON.stringify({ ...p, _inventory: inv }, null, 2));
}

async function productsPut(flags) {
  let input;
  if (flags.file) {
    input = JSON.parse(readFileSync(flags.file, 'utf-8'));
  } else {
    input = {
      product_id: flags.id,
      title: flags.title,
      description: flags.description,
      price_jpy: flags.price,
      duration_sec: flags.duration,
      thumbnail_s3_key: flags.thumbnail,
      source_s3_key: flags.source,
      pool_target: flags['pool-target'],
      pool_threshold: flags['pool-threshold'],
      published: Boolean(flags.published),
    };
  }
  const item = await store.putProduct(input);
  console.log(`[OK] put product ${item.product_id} (¥${item.price_jpy}, ${item.published ? '公開' : '非公開'})`);
}

async function productsSetPrice(positional) {
  const [product_id, priceStr] = positional;
  if (!product_id || priceStr === undefined) die('usage: products set-price <product_id> <price_jpy>');
  const r = await store.setPrice(product_id, Number(priceStr));
  console.log(`[OK] ${r.product_id} price -> ¥${r.price_jpy}(次回チェックアウトから即反映)`);
}

async function productsPublish(positional) {
  const [product_id, valStr] = positional;
  if (!product_id || (valStr !== 'true' && valStr !== 'false')) {
    die('usage: products publish <product_id> <true|false>');
  }
  const r = await store.setPublished(product_id, valStr === 'true');
  console.log(`[OK] ${r.product_id} published -> ${r.published}`);
}

async function inventoryCmd(positional) {
  if (positional[0]) {
    const inv = await store.inventoryOf(positional[0]);
    return console.log(`${positional[0]}  未割当(在庫)=${inv.unassigned}  販売済=${inv.assigned}`);
  }
  const items = await store.listProducts({ all: true });
  for (const p of items) {
    console.log(`${p.product_id}  未割当(在庫)=${p.inventory.unassigned}  販売済=${p.inventory.assigned}`);
  }
}

async function tokensList(positional, flags) {
  const product_id = positional[0];
  if (!product_id) die('usage: tokens list <product_id> [--all]');
  const items = await store.listTokens(product_id, { all: Boolean(flags.all) });
  for (const t of items) console.log(`${t.token_id}  ${t.status}  ${t.s3_key}  order=${t.order_id ?? '-'}`);
  console.log(`(${items.length} 件)`);
}

async function tokensBackfill(flags) {
  const r = await store.backfillTokens({ dryRun: Boolean(flags['dry-run']) });
  for (const d of r.details) console.log(`[${r.dryRun ? 'DRY' : 'FIX'}] ${d.token_id} -> ${d.status_created_at}`);
  console.log(`\nscanned=${r.scanned} ${r.dryRun ? 'would-fix' : 'fixed'}=${r.fixed}`);
}

async function ingest(flags) {
  if (!flags.file) die('--file <local.mp4> required');
  const fileBytes = readFileSync(flags.file);
  const r = await store.ingest({
    product_id: flags.id,
    fileBytes,
    bits: flags.bits === true ? undefined : flags.bits,
    token_id: flags['token-id'] === true ? undefined : flags['token-id'],
  });
  console.log(`[S3] put s3://${r.bucket}/${r.s3_key} (${r.bytes} bytes)`);
  console.log(`[DDB] token ${r.token_id} for ${flags.id} (在庫+1)`);
}

async function couponsAdd(flags) {
  const item = await store.addCoupon({
    coupon_code: flags.code,
    product_id: flags.product,
    discount_percent: flags.percent,
    max_redemptions: flags.max,
    expires_at: flags.expires,
  });
  if (!flags.code || flags.code === true) console.log(`(--code 未指定 → 自動生成: ${item.coupon_code})`);
  console.log(
    `[OK] coupon ${item.coupon_code}: ${item.discount_percent}% off ${item.product_id} (max ${item.max_redemptions}${item.expires_at ? `, expires ${item.expires_at}` : ''})`,
  );
}

async function couponsList(flags) {
  const items = await store.listCoupons({ product: flags.product });
  if (items.length === 0) return console.log('(クーポンなし)');
  for (const c of items) {
    console.log(
      `${c.coupon_code}  ${c.discount_percent}%  ${c.product_id}  利用 ${c.redeemed_count}/${c.max_redemptions}  expires=${c.expires_at ?? '-'}`,
    );
  }
}

async function couponsGet(positional) {
  const code = positional[0];
  if (!code) die('usage: coupons get <coupon_code>');
  const c = await store.getCouponRec(code);
  if (!c) die(`coupon not found: ${code}`);
  console.log(JSON.stringify(c, null, 2));
}

async function couponsDelete(positional) {
  const code = positional[0];
  if (!code) die('usage: coupons delete <coupon_code>');
  await store.deleteCoupon(code);
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
