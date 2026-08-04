/**
 * アクセス集計 CLI(サイト指定)
 *
 *   node scripts/access/access-stats.mjs                        # rou39.com / 直近7日
 *   node scripts/access/access-stats.mjs --days=30              # rou39.com / 直近30日
 *   node scripts/access/access-stats.mjs --site=uraneko         # uraneko
 *
 * GUI で見たいときは scripts/access/access-server.mjs を使う。
 * 前提: AWS CLI / 環境変数で ap-northeast-1 に認証済み。
 */
import { pathToFileURL } from 'node:url';
import * as core from '../lib/cf-access-stats.mjs';

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

async function main() {
  const site = arg('site', 'rou39');
  const days = Math.max(1, parseInt(arg('days', '7'), 10));
  const cfg = core.siteConfig(site);
  process.stdout.write(`${cfg.label} の直近 ${days} 日を集計中…\n`);
  core.printReport(await core.collect({ site, days }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('エラー:', e.message); process.exit(1); });
}
