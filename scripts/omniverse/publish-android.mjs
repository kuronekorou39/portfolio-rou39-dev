/**
 * OmniVerse の Android 版を配信する
 *
 * Usage:
 *   node scripts/omniverse/publish-android.mjs --notes "軽微な修正"
 *   node scripts/omniverse/publish-android.mjs --version 1.14.1 --notes "..."
 *   node scripts/omniverse/publish-android.mjs --notes "..." --dry-run
 *   node scripts/omniverse/publish-android.mjs --notes "..." --no-push
 *   node scripts/omniverse/publish-android.mjs --beta --notes "テスト版"
 *
 * 何をするか:
 *   1. mobile-omniverse の GitHub Release から APK を取得
 *   2. APK を S3 に配置（98MB あるのでリポジトリには入れない）
 *   3. frontend/public/omniverse/update.json を更新（アプリ内の更新チェック用）
 *   4. data/projects.json の downloads[].url を更新（作品ページの DL ボタン用）
 *   5. commit & push
 *
 * push 後は CI (deploy.yml) が残りを引き受ける:
 *   - CDK デプロイで update.json が配信され、CloudFront も全体 invalidate される
 *   - seed-projects.mjs が DynamoDB を更新し、/downloads/omniverse が新しい URL を返す
 *
 * update.json と projects.json は用途が違うだけで同じ APK を指す。
 * 片方だけ更新すると、アプリは新版を案内するのにサイトからは旧版が落ちてくる、
 * という食い違いが起きるのでこのスクリプトで揃える。
 *
 * iOS は App Store の照会 API を見ているので対象外。Android だけが自前配布。
 *
 * --beta はテスト版として出す。APK を S3 に置き、update-beta.json だけを更新する。
 * update.json と projects.json には触らないので、届くのはアプリのデバッグ設定で
 * 「テスト版も受け取る」をオンにした端末だけ。確かめて問題なければ、--beta を
 * 付けずにもう一度走らせると全員に配られる（APK は同じものなので上げ直さない）。
 *
 * 前提:
 *   - gh CLI が mobile-omniverse を読める状態で認証済み
 *   - AWS CLI / 環境変数で認証済み
 */

import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { parseArgs } from 'util';
import { fileURLToPath } from 'url';

const require = createRequire(new URL('../../backend/', import.meta.url).href);
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');

const MOBILE_REPO = 'kuronekorou39/mobile-omniverse';
const BUCKET = 'rou39-site';
const PREFIX = 'omniverse';
const REGION = 'ap-northeast-1';
const SITE_BASE = 'https://rou39.com/omniverse';
const PROJECT_ID = 'omniverse';
const APK_CONTENT_TYPE = 'application/vnd.android.package-archive';

const UPDATE_JSON = join(REPO_ROOT, 'frontend/public/omniverse/update.json');
const BETA_JSON = join(REPO_ROOT, 'frontend/public/omniverse/update-beta.json');
const PROJECTS_JSON = join(REPO_ROOT, 'data/projects.json');

const { values } = parseArgs({
  options: {
    version: { type: 'string' },
    notes: { type: 'string' },
    apk: { type: 'string' },
    beta: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    'no-push': { type: 'boolean', default: false },
  },
});

const dryRun = values['dry-run'];
const beta = values.beta;

function sh(cmd, args, opts = {}) {
  const shown = `${cmd} ${args.join(' ')}`;
  if (dryRun && !opts.readOnly) {
    console.log(`  [dry-run] ${shown}`);
    return '';
  }
  if (!opts.quiet) console.log(`  $ ${shown}`);
  return execFileSync(cmd, args, { encoding: 'utf-8', ...opts }).trim();
}

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

if (!values.notes) fail('--notes は必須です（更新ダイアログに出る文言）');

// Windows では引数に実際の改行を渡せない（渡すと1行目で切れる）。
// 複数行にしたいときは "1行目\n2行目" のように \n を書いてもらう。
const notes = values.notes.replace(/\\n/g, '\n');

// バージョン未指定なら GitHub Release の最新を使う
const version =
  values.version ??
  sh('gh', ['release', 'view', '-R', MOBILE_REPO, '--json', 'tagName', '-q', '.tagName'], {
    readOnly: true,
    quiet: true,
  }).replace(/^v/, '');

if (!/^\d+(\.\d+)*$/.test(version)) fail(`バージョンの形が変です: ${version}`);

const apkName = `OmniVerse-v${version}.apk`;
const apkUrl = `${SITE_BASE}/${apkName}`;

console.log(`OmniVerse ${version} を Android 向けに${beta ? 'テスト版として' : ''}配信`);
if (dryRun) console.log('(dry-run: 何も変更しない)');

const tmp = mkdtempSync(join(tmpdir(), 'omniverse-'));
try {
  console.log(`\n[1/5] APK を用意`);
  let apkPath = values.apk;
  if (apkPath) {
    console.log(`      ローカル指定: ${apkPath}`);
  } else {
    sh('gh', ['release', 'download', `v${version}`, '-R', MOBILE_REPO,
      '-p', apkName, '--dir', tmp, '--clobber']);
    apkPath = join(tmp, apkName);
  }

  let body = null;
  if (!dryRun) {
    body = readFileSync(apkPath);
    // サイトは存在しないパスにも SPA の HTML を 200 で返すので、
    // 取り違えたときに大きさで気づけるようにしておく
    if (body.length < 10 * 1024 * 1024) {
      fail(`APK が小さすぎます (${body.length} bytes)。取得に失敗している可能性`);
    }
    console.log(`      ${body.length.toLocaleString()} bytes`);
  }

  console.log(`\n[2/5] S3 に配置 → s3://${BUCKET}/${PREFIX}/${apkName}`);
  if (dryRun) {
    console.log('  [dry-run] PutObject');
  } else {
    const s3 = new S3Client({ region: REGION });
    const key = `${PREFIX}/${apkName}`;
    let already = false;
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
      already = head.ContentLength === body.length;
    } catch {
      // 未アップロード。そのまま上げる
    }
    if (already) {
      console.log('      同じものが既にあるのでスキップ');
    } else {
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: APK_CONTENT_TYPE,
      }));
      console.log('      アップロード完了');
    }
  }

  const manifestName = beta ? 'update-beta.json' : 'update.json';
  console.log(`\n[3/5] ${manifestName} を更新（アプリ内の更新チェック）`);
  const updateJson = { version, release_notes: notes, apk_url: apkUrl };
  console.log(`      version=${version}`);
  for (const line of notes.split('\n')) console.log(`      | ${line}`);
  if (!dryRun) {
    writeFileSync(beta ? BETA_JSON : UPDATE_JSON, JSON.stringify(updateJson, null, 2) + '\n', 'utf-8');
  }

  console.log(`\n[4/5] projects.json の downloads を更新（作品ページの DL ボタン）`);
  if (beta) {
    console.log('      テスト版なのでスキップ（サイトからは公開版を落とさせる）');
  } else {
    const projects = JSON.parse(readFileSync(PROJECTS_JSON, 'utf-8'));
    const project = projects.find((p) => p.id === PROJECT_ID);
    if (!project) fail(`projects.json に id=${PROJECT_ID} がありません`);
    const entry = (project.downloads ?? []).find((d) => d.os === 'android');
    if (!entry) fail(`projects.json の ${PROJECT_ID} に android の downloads がありません`);
    console.log(`      ${entry.url}`);
    console.log(`   →  ${apkUrl}`);
    if (!dryRun) {
      entry.url = apkUrl;
      writeFileSync(PROJECTS_JSON, JSON.stringify(projects, null, 2) + '\n', 'utf-8');
    }
  }

  console.log(`\n[5/5] コミット`);
  const paths = beta
    ? ['frontend/public/omniverse/update-beta.json']
    : ['frontend/public/omniverse/update.json', 'data/projects.json'];
  sh('git', ['-C', REPO_ROOT, 'add', ...paths]);
  const staged = sh('git', ['-C', REPO_ROOT, 'diff', '--cached', '--name-only'], { quiet: true });
  if (dryRun || staged) {
    const what = beta ? 'Android のテスト版' : 'Android';
    sh('git', ['-C', REPO_ROOT, 'commit', '-m', `chore: OmniVerse ${what} を ${version} に更新`]);
    if (values['no-push']) {
      console.log('      push はスキップ（--no-push）');
    } else {
      sh('git', ['-C', REPO_ROOT, 'push', 'origin', 'main']);
    }
  } else {
    console.log('      変更なし。コミットをスキップ');
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n✅ 完了`);
if (!dryRun && !values['no-push']) {
  console.log('   CI が CDK デプロイと DynamoDB の seed を行います。');
  console.log(`   反映後に確認: curl -s ${SITE_BASE}/${beta ? 'update-beta.json' : 'update.json'}`);
}
