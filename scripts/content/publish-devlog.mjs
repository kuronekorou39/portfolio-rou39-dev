/**
 * Devlog を rou39.com に公開する。手元からも CI からも使う。
 *
 *   node scripts/content/publish-devlog.mjs               検査 → 生成 → S3 へ同期
 *   node scripts/content/publish-devlog.mjs --dryrun      S3 に何をするかだけ表示する
 *   node scripts/content/publish-devlog.mjs --invalidate  同期のあと CloudFront のキャッシュも消す(CI 用)
 *
 * ログと図には短いキャッシュ時間(Cache-Control)を付けて上げる。キャッシュを消さなくても
 * その時間内に入れ替わるので、手元の権限(rou39-site への書き込みだけ)で公開できる。
 * GitHub Actions が動かなくても公開できるようにするための経路。手順は docs/devlog.md。
 *
 * --delete で同期するので、手元に無いログは配信から消える。他の端末で足したログがあるなら先に pull する。
 */
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const bucket = process.env.SITE_BUCKET ?? 'rou39-site';
// CloudFront(rou39.com)はこの値に従う。ここを変えると反映までの最長時間が変わる
const CACHE_SECONDS = 300;
const CACHE_CONTROL = `public, max-age=${CACHE_SECONDS}`;

const dryrun = process.argv.includes('--dryrun');
const invalidate = process.argv.includes('--invalidate');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) {
    console.error(`${command} を起動できない: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// 検査に落ちたらここで止まり、S3 には何も上げない
run(process.execPath, [join('scripts', 'content', 'build-content.mjs')]);

const syncs = [
  // 一覧(index.json)と本文
  ['frontend/public/content/devlog', 'content/devlog'],
  // 図
  ['frontend/public/devlog', 'devlog'],
];
for (const [local, remote] of syncs) {
  run('aws', [
    's3', 'sync', local, `s3://${bucket}/${remote}`,
    '--delete',
    '--cache-control', CACHE_CONTROL,
    ...(dryrun ? ['--dryrun'] : []),
  ]);
}

if (invalidate && !dryrun) {
  const distributionId = process.env.SITE_DISTRIBUTION_ID;
  if (!distributionId) {
    console.error('--invalidate には SITE_DISTRIBUTION_ID が要る');
    process.exit(1);
  }
  run('aws', [
    'cloudfront', 'create-invalidation', '--distribution-id', distributionId,
    '--paths', '/content/devlog/*', '/devlog/*',
  ]);
}

console.log(
  dryrun
    ? 'Devlog: --dryrun なので S3 は変えていない'
    : `Devlog: 公開した${invalidate ? '(キャッシュも消した)' : `。${CACHE_SECONDS / 60} 分以内にサイトへ出る`}`,
);
