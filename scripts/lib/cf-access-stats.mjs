/**
 * CloudFront アクセスログの集計(サイト共通)
 *
 * CloudFront の標準アクセスログ(S3)を読んで、直近のアクセスをざっくり集計する。
 * rou39.com と uraneko.rou39.com で同じロジックを使う。常設ダッシュボードは持たず、
 * 見たいときにローカルから実行する運用。
 *
 * 注意:
 *  - ログ配信には数分〜数時間の遅れがある(直近分は未反映のことがある)。
 *  - SPA のクライアント側遷移はリクエストが飛ばないためログに残らない。
 *    パス別の集計は「入口ページ」(直接アクセス・再読み込み・クローラ)の内訳になる。
 *  - 時刻は JST 表示(ログ自体は UTC)。
 *
 * 前提: AWS CLI / 環境変数で ap-northeast-1 に認証済みであること。
 */
import { S3Client, ListBucketsCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { gunzipSync } from 'node:zlib';

const BOT_RE = /bot|crawl|spider|slurp|bing|google|yandex|baidu|duckduck|facebookexternalhit|headless|python-requests|curl|wget|monitor|uptime|pingdom/i;

export const REGION = process.env.AWS_REGION || 'ap-northeast-1';

/**
 * 集計対象サイト。
 *
 * selfHosts は「自サイト内リンク」として流入元から除外するホスト。
 * サブドメイン (uraneko / notes) は別サイト扱いにしたいので完全一致で持つ。
 *
 * routes は実在するページのパターン。SPA は 404 を index.html に差し替えて 200 を返すため、
 * /wp-admin/install.php のような探索アクセスもそのままではページ表示として数えられてしまう。
 * ここに載らないパスは「探索アクセス」として本来の集計から分離する。
 * routes を持たないサイトは全部を実ページ扱いにする(誤判定を出さない)。
 */
export const SITES = {
  rou39: {
    key: 'rou39',
    label: 'rou39.com(ポートフォリオ)',
    bucket: 'rou39-cloudfront-logs',
    prefix: 'cf/',
    selfHosts: ['rou39.com', 'www.rou39.com'],
    envBucket: 'ROU39_LOG_BUCKET',
    // API も同じディストリビューション配下にあるので、ページ表示から除外する
    excludePrefixes: ['/api'],
    routes: [
      /^\/$/,
      /^\/apps(\/[^/]+)?$/,
      /^\/auth(\/callback)?$/,
      /^\/profile$/,
      /^\/contact$/,
      /^\/clip(\/[^/]+)?$/,
      /^\/games\/2048$/,
      /^\/privacy-policy$/,
      /^\/relations$/,
      /^\/april-fools$/,
      /^\/admin(\/dashboard)?$/,
      // public/ に置いている静的ページ
      /^\/(kokomeshi|omniverse)\/privacy-policy\.html$/,
      /^\/relations-app\/?$/,
      /^\/_ogp\/[\w-]+\.html$/,
    ],
  },
  notes: {
    key: 'notes',
    label: 'notes.rou39.com(Stash Notes)',
    bucketPattern: /^notes-access-logs-/,
    prefix: 'cf/',
    selfHosts: ['notes.rou39.com'],
    envBucket: 'NOTES_LOG_BUCKET',
    excludePrefixes: ['/api'],
    // 秘密URLのトークンは location.hash にあるためサーバには届かない。
    // ログに残るのは /m までで、どのメモが開かれたかはここからは分からない
    routes: [
      /^\/$/,
      /^\/m(\/.*)?$/,
      /^\/privacy$/,
      /^\/terms$/,
      /^\/auth\/callback$/,
    ],
  },
  uraneko: {
    key: 'uraneko',
    label: 'uraneko.rou39.com(動画販売)',
    bucketPattern: /^uraneko-access-logs-/,
    prefix: 'cf/',
    selfHosts: ['uraneko.rou39.com'],
    envBucket: 'URANEKO_LOG_BUCKET',
    excludePrefixes: ['/api'],
    routes: [
      /^\/$/,
      /^\/product\/[^/]+$/,
      /^\/checkout\/[^/]+$/,
      /^\/order\/[^/]+\/complete$/,
      /^\/my\/orders$/,
      /^\/guide$/,
      /^\/legal\/(tokushoho|privacy|terms)$/,
      /^\/auth\/callback$/,
    ],
  },
};

export function siteConfig(name) {
  const site = SITES[name];
  if (!site) throw new Error(`未知のサイト: ${name}(有効: ${Object.keys(SITES).join(' / ')})`);
  return site;
}

export function decode(s) {
  try {
    return decodeURIComponent((s || '').replace(/\+/g, ' '));
  } catch {
    return s || '';
  }
}

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
export function summarize(rows, site = {}) {
  const selfHosts = site.selfHosts || [];
  const excludePrefixes = site.excludePrefixes || [];
  const routes = site.routes || null;
  const byDay = new Map(), byHour = new Map(), refs = new Map();
  const byIp = new Map(), byUa = new Map(), byPath = new Map(), byProbePath = new Map();
  const ips = new Set(), probeIps = new Set();
  let total = 0, pv = 0, bots = 0, probes = 0;

  for (const r of rows) {
    total++;
    const t = jst(r['date'], r['time']);
    const uri = r['cs-uri-stem'] || '';
    const status = r['sc-status'] || '';
    const ct = (r['sc-content-type'] || '').toLowerCase();
    // ページ表示 = GET・2xx/304 で、レスポンスが HTML(または拡張子なしの SPA ルート)。
    // アセット(.js/.css/画像)と API は除外する。
    const excluded = excludePrefixes.some((p) => uri.startsWith(p));
    const isPage = r['cs-method'] === 'GET' && /^(2\d\d|304)$/.test(status) && !excluded &&
      (ct.includes('text/html') || uri === '/' || uri === '/index.html' || !/\.[a-z0-9]+$/i.test(uri));
    if (!isPage || !t) continue;

    const path = uri === '/index.html' ? '/' : uri;
    const ip = r['c-ip'] || '?';

    // 実在しないパスは探索アクセス。SPA のフォールバックで 200 が返るだけなので、
    // 日別・訪問者・リファラといった本来の指標には混ぜない
    if (routes && !routes.some((re) => re.test(path))) {
      probes++;
      probeIps.add(ip);
      byProbePath.set(path, (byProbePath.get(path) || 0) + 1);
      continue;
    }
    pv++;

    const ua = decode(r['cs(User-Agent)']);
    const bot = BOT_RE.test(ua);
    if (bot) bots++;
    ips.add(ip);
    byDay.set(t.day, (byDay.get(t.day) || 0) + 1);
    byHour.set(t.key, (byHour.get(t.key) || 0) + 1);

    // パス別。SPA の内部遷移は記録されないので、これは入口ページの内訳になる
    byPath.set(path, (byPath.get(path) || 0) + 1);

    // アクセス元 IP 別(回数・最終アクセス・代表UA)
    const ts = `${r['date']}T${r['time']}Z`;
    const rec = byIp.get(ip) || { count: 0, lastTs: '', ua: '', bot };
    rec.count++;
    if (ts > rec.lastTs) { rec.lastTs = ts; rec.ua = ua; rec.bot = bot; }
    byIp.set(ip, rec);
    byUa.set(ua, (byUa.get(ua) || 0) + 1);

    const ref = decode(r['cs(Referer)']);
    if (ref && ref !== '-') {
      let host = ref;
      try { host = new URL(ref).host; } catch { /* URL として読めないときは生のまま */ }
      if (!selfHosts.includes(host)) refs.set(host, (refs.get(host) || 0) + 1);
    }
  }
  return {
    total, pv, uniqueIps: ips.size, bots,
    probes, probeIps: probeIps.size,
    byDay, byHour, refs, byIp, byUa, byPath, byProbePath,
  };
}

async function toBuffer(body) {
  const chunks = [];
  for await (const c of body) chunks.push(c);
  return Buffer.concat(chunks);
}

// バケット名は 環境変数 → 設定の固定名 → 名前パターンでの検索 の順で決める
export async function resolveBucket(s3, site) {
  if (site.envBucket && process.env[site.envBucket]) return process.env[site.envBucket];
  if (site.bucket) return site.bucket;
  const r = await s3.send(new ListBucketsCommand({}));
  const found = (r.Buckets || []).find((x) => site.bucketPattern.test(x.Name || ''));
  if (!found) {
    throw new Error(
      `アクセスログ用バケット(${site.bucketPattern})が見つかりません。` +
      'フロントをデプロイ済みか、AWS 認証(ap-northeast-1)を確認してください。'
    );
  }
  return found.Name;
}

async function listRecentKeys(s3, bucket, prefix, since) {
  const keys = [];
  let ContinuationToken;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken }));
    for (const o of r.Contents || []) if (o.LastModified && o.LastModified.getTime() >= since) keys.push(o.Key);
    ContinuationToken = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return keys;
}

// S3 からログを取得して集計まで行う(CLI と ローカル GUI の両方から使う)
export async function collect({ site = 'rou39', days = 7, region, bucket, s3 } = {}) {
  const cfg = typeof site === 'string' ? siteConfig(site) : site;
  s3 = s3 || new S3Client({ region: region || REGION });
  bucket = bucket || (await resolveBucket(s3, cfg));
  const since = Date.now() - Math.max(1, days) * 86400 * 1000;
  const keys = await listRecentKeys(s3, bucket, cfg.prefix, since);
  const rows = [];
  for (const key of keys) {
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    rows.push(...parseLog(gunzipSync(await toBuffer(obj.Body)).toString('utf-8')));
  }
  return { site: cfg.key, label: cfg.label, bucket, days, keysCount: keys.length, stats: summarize(rows, cfg) };
}

// collect() の結果を JSON 化(Map → 配列)。GUI のエンドポイント用。
export function statsToJSON(res) {
  const s = res.stats;
  const jstMin = (utc) => {
    const d = new Date(utc);
    return isNaN(d.getTime()) ? '' : new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
  };
  const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  return {
    site: res.site, label: res.label, bucket: res.bucket, days: res.days, keysCount: res.keysCount,
    total: s.total, pageViews: s.pv, uniqueIps: s.uniqueIps, bots: s.bots,
    probes: s.probes, probeIps: s.probeIps,
    probePaths: top(s.byProbePath, 15).map(([path, count]) => ({ path, count })),
    byDay: [...s.byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    byHour: [...s.byHour.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    refs: top(s.refs, 15),
    paths: top(s.byPath, 20).map(([path, count]) => ({ path, count })),
    ips: [...s.byIp.entries()]
      .map(([ip, v]) => ({ ip, count: v.count, last: jstMin(v.lastTs), ua: v.ua, bot: v.bot }))
      .sort((a, b) => b.count - a.count).slice(0, 25),
    uas: top(s.byUa, 15).map(([ua, count]) => ({ ua, count })),
  };
}

// ---- CLI 用の表示(uraneko / rou39 の両方の CLI から使う)----
function bar(n, max, width = 28) {
  return max <= 0 ? '' : '█'.repeat(Math.max(n > 0 ? 1 : 0, Math.round((n / max) * width)));
}
function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : ' '.repeat(n - s.length) + s;
}

export function printReport(res) {
  const st = res.stats;
  if (!res.keysCount) {
    console.log(`バケット: ${res.bucket}\nログがまだありません(配信に数分〜数時間かかります。アクセスが無ければ空です)。`);
    return;
  }

  console.log(`\n=== ${res.label} アクセス集計(直近 ${res.days} 日 / JST)===`);
  console.log(`バケット: ${res.bucket}   ログファイル: ${res.keysCount} 個   総リクエスト: ${st.total}(アセット等込み)`);
  console.log(`ページ表示: ${st.pv}   ざっくり訪問者(ユニークIP): ${st.uniqueIps}   うちボットっぽい: ${st.bots}`);
  console.log(`探索アクセス: ${st.probes}(実在しないパス / ${st.probeIps} IP)※以降の集計からは除外`);

  const days = [...st.byDay.keys()].sort();
  const dMax = Math.max(0, ...st.byDay.values());
  console.log('\n— 日別ページ表示 —');
  for (const d of days) console.log(`  ${d}  ${pad(st.byDay.get(d), 5)}  ${bar(st.byDay.get(d), dMax)}`);

  console.log('\n— 時間別(直近48時間)—');
  const hours = [...st.byHour.keys()].sort().slice(-48);
  const hMax = Math.max(0, ...hours.map((h) => st.byHour.get(h)));
  for (const h of hours) console.log(`  ${h}時  ${pad(st.byHour.get(h), 4)}  ${bar(st.byHour.get(h), hMax, 20)}`);

  const j = statsToJSON(res);

  console.log('\n— 入口ページ(上位15)—');
  if (!j.paths.length) console.log('  (データなし)');
  else for (const x of j.paths.slice(0, 15)) console.log(`  ${pad(x.count, 5)}  ${x.path}`);

  console.log('\n— 流入元(リファラ)トップ10 —');
  if (!j.refs.length) console.log('  (外部リファラなし=直アクセス/ブックマーク中心)');
  else for (const [h, n] of j.refs.slice(0, 10)) console.log(`  ${pad(n, 5)}  ${h}`);

  console.log('\n— アクセス元 IP(ページ表示・上位15)—');
  for (const x of j.ips.slice(0, 15)) {
    console.log(`  ${pad(x.count, 4)}  ${pad(x.ip, 15)}  ${x.last}  ${x.bot ? '[bot] ' : ''}${(x.ua || '').slice(0, 60)}`);
  }

  console.log('\n— User-Agent(上位10)—');
  for (const x of j.uas.slice(0, 10)) console.log(`  ${pad(x.count, 4)}  ${(x.ua || '').slice(0, 80)}`);

  if (j.probePaths.length) {
    console.log('\n— 探索アクセス先(上位10 / 集計対象外)—');
    for (const x of j.probePaths.slice(0, 10)) console.log(`  ${pad(x.count, 5)}  ${x.path}`);
  }

  console.log('\n※ SPA の内部遷移はログに残らないため、パス別は「入口ページ」の内訳です。');
  console.log('※ 直近のログは配信遅延で未反映のことがあります。ログは 90 日で自動削除。');
}
