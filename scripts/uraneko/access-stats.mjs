/**
 * uraneko アクセス集計(軽量)
 *
 *   node scripts/uraneko/access-stats.mjs            # 直近7日
 *   node scripts/uraneko/access-stats.mjs --days=30  # 直近30日
 *
 * 集計ロジックは rou39.com と共通 (scripts/lib/cf-access-stats.mjs)。
 * ここは uraneko のサイト設定を束ねるだけの薄い入口。
 * 管理 GUI (uraneko-admin-server.mjs) も collect / statsToJSON をここから使う。
 *
 * 前提: AWS CLI / 環境変数で ap-northeast-1 に認証済み(管理ツールと同じ)。
 * バケットは自動検出。URANEKO_LOG_BUCKET で明示指定も可。
 */
import { pathToFileURL } from 'node:url';
import * as core from '../lib/cf-access-stats.mjs';

export { decode, parseLog, jst, statsToJSON } from '../lib/cf-access-stats.mjs';

export const summarize = (rows) => core.summarize(rows, core.SITES.uraneko);
export const collect = (opts = {}) => core.collect({ ...opts, site: 'uraneko' });

async function main() {
  const days = Math.max(1, parseInt((process.argv.find((a) => a.startsWith('--days=')) || '').split('=')[1] || '7', 10));
  process.stdout.write(`直近 ${days} 日を集計中…\n`);
  core.printReport(await collect({ days }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('エラー:', e.message); process.exit(1); });
}
