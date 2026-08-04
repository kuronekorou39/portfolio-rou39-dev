/**
 * uraneko アクセス集計(軽量)
 *
 * CloudFront の標準アクセスログ(S3: uraneko-access-logs-<account>)を読んで、
 * 直近のアクセス数をざっくり集計して表示するだけのローカルスクリプト。
 * 常設ダッシュボードは持たず、見たいときに実行する運用。
 *
 *   node scripts/uraneko/access-stats.mjs            # 直近7日
 *   node scripts/uraneko/access-stats.mjs --days=30  # 直近30日
 *
 * 前提: AWS CLI / 環境変数で ap-northeast-1 に認証済み(管理ツールと同じ)。
 * バケットは自動検出。URANEKO_LOG_BUCKET で明示指定も可。
 *
 * 注意:
 *  - CloudFront のログは配信に数分〜数時間の遅れがある(直近分は未反映のことがある)。
 *  - SPA なので、ページ表示はすべて /index.html に集約される(ページ別内訳は取れない)。
 *  - 時刻は JST 表示(ログ自体は UTC)。
 */
import { S3Client, ListBucketsCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const BOT_RE = /bot|crawl|spider|slurp|bing|google|yandex|baidu|duckduck|facebookexternalhit|headless|python-requests|curl|wget|monitor|uptime|pingdom/i;

export function decode(s) { try { return decodeURIComponent((s || '').replace(/\+/g, ' ')); } catch { return s || ''; } }

// CloudFront 標準ログ(tab 区切り、#Fields: で列名)をパース
export function parseLog(text) {
  let fields = null;
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    if (line.startsWith('#Fields:')) { fields = line.slice(8).trim().split(/\s+/); continue; }
    if (line.startsWith('#')) continue;
    if (!fields) continue;
    const v = line.split('\t');
    const rec = {};
    for (let i = 0; i < fields.length; i++) rec[fields[i]] = v[i];
    rows.push(rec);
  }
  return rows;
}

// UTC の date/time を JST の {day, hour, key} に
export function jst(date, time) {
  const d = new Date(`${date}T${time}Z`);
  if (isNaN(d.getTime())) return null;
  const j = new Date(d.getTime() + 9 * 3600 * 1000).toISOString();
  return { day: j.slice(0, 10), hour: j.slice(11, 13), key: j.slice(0, 13).replace('T', ' ') };
}

// パース済みの行から集計(純関数=テスト可能)
export function summarize(rows) {
  const byDay = new Map(), byHour = new Map(), refs = new Map(), byIp = new Map(), byUa = new Map();
  const ips = new Set();
  let total = 0, pv = 0, bots = 0;
  for (const r of rows) {
    total++;
    const t = jst(r['date'], r['time']);
    const uri = r['cs-uri-stem'] || '';
    const status = r['sc-status'] || '';
    const ct = (r['sc-content-type'] || '').toLowerCase();
    // ページ表示 = GET・2xx/304 で、レスポンスが HTML(または /api でない拡張子なしの SPA ルート)。
    // SPA は URI がそのまま記録される(/、/guide 等)。アセット(.js/.css/画像)と API(/api・JSON)は除外。
    const isPage = r['cs-method'] === 'GET' && /^(2\d\d|304)$/.test(status) && !uri.startsWith('/api') &&
      (ct.includes('text/html') || uri === '/' || uri === '/index.html' || !/\.[a-z0-9]+$/i.test(uri));
    if (!isPage || !t) continue;
    pv++;
    const ua = decode(r['cs(User-Agent)']);
    const bot = BOT_RE.test(ua);
    if (bot) bots++;
    const ip = r['c-ip'] || '?';
    ips.add(ip);
    byDay.set(t.day, (byDay.get(t.day) || 0) + 1);
    byHour.set(t.key, (byHour.get(t.key) || 0) + 1);
    // アクセス元 IP 別(回数・最終アクセス・代表UA)
    const ts = `${r['date']}T${r['time']}Z`;
    const rec = byIp.get(ip) || { count: 0, lastTs: '', ua: '', bot };
    rec.count++;
    if (ts > rec.lastTs) { rec.lastTs = ts; rec.ua = ua; rec.bot = bot; }
    byIp.set(ip, rec);
    byUa.set(ua, (byUa.get(ua) || 0) + 1);
    const ref = decode(r['cs(Referer)']);
    if (ref && ref !== '-' && !/uraneko\.rou39\.com/.test(ref)) {
      let host = ref;
      try { host = new URL(ref).host; } catch { /* 生のまま */ }
      refs.set(host, (refs.get(host) || 0) + 1);
    }
  }
  return { total, pv, uniqueIps: ips.size, bots, byDay, byHour, refs, byIp, byUa };
}

// ---- ここから CLI(直接実行時のみ動く。import 時は動かない=テスト用)----
const REGION = process.env.AWS_REGION || 'ap-northeast-1';

async function toBuffer(body) {
  const chunks = [];
  for await (const c of body) chunks.push(c);
  return Buffer.concat(chunks);
}
async function findBucket(s3) {
  if (process.env.URANEKO_LOG_BUCKET) return process.env.URANEKO_LOG_BUCKET;
  const r = await s3.send(new ListBucketsCommand({}));
  const b = (r.Buckets || []).find((x) => /^uraneko-access-logs-/.test(x.Name || ''));
  if (!b) throw new Error('アクセスログ用バケット(uraneko-access-logs-*)が見つかりません。フロントをデプロイ済みか、AWS 認証(ap-northeast-1)を確認してください。');
  return b.Name;
}
async function listRecentKeys(s3, bucket, since) {
  const keys = [];
  let ContinuationToken;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'cf/', ContinuationToken }));
    for (const o of r.Contents || []) if (o.LastModified && o.LastModified.getTime() >= since) keys.push(o.Key);
    ContinuationToken = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return keys;
}
function bar(n, max, width = 28) { return max <= 0 ? '' : '█'.repeat(Math.max(n > 0 ? 1 : 0, Math.round((n / max) * width))); }
function pad(s, n) { s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; }

// S3 からログを取得して集計まで行う(CLI と 管理GUI の両方から使う)。
export async function collect({ days = 7, region, bucket, s3 } = {}) {
  s3 = s3 || new S3Client({ region: region || REGION });
  bucket = bucket || (await findBucket(s3));
  const since = Date.now() - Math.max(1, days) * 86400 * 1000;
  const keys = await listRecentKeys(s3, bucket, since);
  const rows = [];
  for (const key of keys) {
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    rows.push(...parseLog(gunzipSync(await toBuffer(obj.Body)).toString('utf-8')));
  }
  return { bucket, days, keysCount: keys.length, stats: summarize(rows) };
}

// collect() の結果を JSON 化(Map → 配列)。管理GUI のエンドポイント用。
export function statsToJSON(res) {
  const s = res.stats;
  const jstMin = (utc) => { const d = new Date(utc); return isNaN(d.getTime()) ? '' : new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' '); };
  return {
    bucket: res.bucket, days: res.days, keysCount: res.keysCount,
    total: s.total, pageViews: s.pv, uniqueIps: s.uniqueIps, bots: s.bots,
    byDay: [...s.byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    byHour: [...s.byHour.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    refs: [...s.refs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15),
    ips: [...s.byIp.entries()].map(([ip, v]) => ({ ip, count: v.count, last: jstMin(v.lastTs), ua: v.ua, bot: v.bot })).sort((a, b) => b.count - a.count).slice(0, 25),
    uas: [...s.byUa.entries()].map(([ua, n]) => ({ ua, count: n })).sort((a, b) => b.count - a.count).slice(0, 15),
  };
}

async function main() {
  const DAYS = Math.max(1, parseInt((process.argv.find((a) => a.startsWith('--days=')) || '').split('=')[1] || '7', 10));
  process.stdout.write(`直近 ${DAYS} 日を集計中…\n`);
  const { bucket, keysCount, stats: st } = await collect({ days: DAYS });
  if (!keysCount) { console.log(`バケット: ${bucket}\nログがまだありません(配信に数分〜数時間かかります。アクセスが無ければ空です)。`); return; }

  console.log(`\n=== uraneko アクセス集計(直近 ${DAYS} 日 / JST)===`);
  console.log(`バケット: ${bucket}   ログファイル: ${keysCount} 個   総リクエスト: ${st.total}(アセット等込み)`);
  console.log(`ページ表示: ${st.pv}   ざっくり訪問者(ユニークIP): ${st.uniqueIps}   うちボットっぽい: ${st.bots}`);

  const days = [...st.byDay.keys()].sort();
  const dMax = Math.max(0, ...st.byDay.values());
  console.log('\n— 日別ページ表示 —');
  for (const d of days) console.log(`  ${d}  ${pad(st.byDay.get(d), 5)}  ${bar(st.byDay.get(d), dMax)}`);

  console.log('\n— 時間別(直近48時間)—');
  const hours = [...st.byHour.keys()].sort().slice(-48);
  const hMax = Math.max(0, ...hours.map((h) => st.byHour.get(h)));
  for (const h of hours) console.log(`  ${h}時  ${pad(st.byHour.get(h), 4)}  ${bar(st.byHour.get(h), hMax, 20)}`);

  const topRefs = [...st.refs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log('\n— 流入元(リファラ)トップ10 —');
  if (!topRefs.length) console.log('  (外部リファラなし=直アクセス/ブックマーク中心)');
  else for (const [h, n] of topRefs) console.log(`  ${pad(n, 5)}  ${h}`);

  const j = statsToJSON({ bucket, days: DAYS, keysCount, stats: st });
  console.log('\n— アクセス元 IP(ページ表示・上位15)—');
  for (const x of j.ips.slice(0, 15)) console.log(`  ${pad(x.count, 4)}  ${pad(x.ip, 15)}  ${x.last}  ${x.bot ? '[bot] ' : ''}${(x.ua || '').slice(0, 60)}`);
  console.log('\n— User-Agent(上位10)—');
  for (const x of j.uas.slice(0, 10)) console.log(`  ${pad(x.count, 4)}  ${(x.ua || '').slice(0, 80)}`);

  console.log('\n※ SPA のためページ別内訳は取れません(全ページ表示が /index.html に集約)。');
  console.log('※ 直近のログは配信遅延で未反映のことがあります。ログは 90 日で自動削除。');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('エラー:', e.message); process.exit(1); });
}
