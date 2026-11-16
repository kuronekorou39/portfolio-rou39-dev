/**
 * Devlog の配信用ファイルを作る。
 *
 *   node scripts/content/build-content.mjs          検査して生成
 *   node scripts/content/build-content.mjs --check  検査だけ
 *
 * data/posts/*.md(正本)を検査し、frontend/public/content/devlog/ に
 *   index.json        一覧用のメタ情報(新しい順)
 *   posts/<slug>.md   本文だけ(frontmatter は index.json に移す)
 * を書き出す。サイトはこれを実行時に読む。検査に 1 件でも落ちたら何も書かずに失敗する
 * (形式違反のログは、push しても載らない)。
 *
 * あわせて data/activity.json(実績)と data/goals.json(目標)から、公開中のアプリの分だけを
 * 同じフォルダの activity.json に書き出す(CI が書き込める場所は content/devlog/ 以下に絞ってある)。
 *
 * 生成物は git で管理しない。frontend の predev / prebuild と、deploy.yml の中身だけの経路が毎回作り直す。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parsePost, sortPosts, validatePost } from './lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const postsDir = join(root, 'data', 'posts');
const publicDir = join(root, 'frontend', 'public');
const outDir = join(publicDir, 'content', 'devlog');
const checkOnly = process.argv.includes('--check');

const projects = JSON.parse(readFileSync(join(root, 'data', 'projects.json'), 'utf8'));
const context = {
  // 非公開のアプリのログは載せない
  projectIds: new Set(projects.filter((p) => p.published !== false).map((p) => p.id)),
  imageExists: (url) => url.startsWith('/') && existsSync(join(publicDir, url)),
};

const posts = [];
const failures = [];
for (const fileName of readdirSync(postsDir).filter((f) => f.endsWith('.md')).sort()) {
  const post = parsePost(fileName, readFileSync(join(postsDir, fileName), 'utf8'));
  if (!post) {
    failures.push(`${fileName}: 記事として読めない(ファイル名 YYYY-MM-DD-<slug>.md / frontmatter / title を確認)`);
    continue;
  }
  for (const problem of validatePost(post, context)) failures.push(`${fileName}: ${problem}`);
  posts.push(post);
}

// 目標(タイムラインの予定)。形式は docs/devlog.md
const goalsPath = join(root, 'data', 'goals.json');
const allGoals = existsSync(goalsPath) ? JSON.parse(readFileSync(goalsPath, 'utf8')) : [];
const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
allGoals.forEach((goal, i) => {
  const where = `data/goals.json の ${i + 1} 件目`;
  if (!projects.some((p) => p.id === goal.project)) failures.push(`${where}: project "${goal.project}" が data/projects.json に無い`);
  if (typeof goal.title !== 'string' || !goal.title.trim()) failures.push(`${where}: title が無い`);
  if (!isDate(goal.start) || !isDate(goal.due)) failures.push(`${where}: start / due は YYYY-MM-DD で書く`);
  else if (goal.start > goal.due) failures.push(`${where}: start が due より後`);
  if (goal.done !== undefined && !isDate(goal.done)) failures.push(`${where}: done は YYYY-MM-DD で書く`);
});

if (failures.length > 0) {
  console.error(`中身の検査に ${failures.length} 件落ちた。ルールは docs/devlog.md:\n` + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

if (!checkOnly) {
  // 消したログが配信に残らないよう、毎回作り直す
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'posts'), { recursive: true });
  const sorted = sortPosts(posts);
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(sorted.map(({ body: _body, ...meta }) => meta)));
  for (const post of sorted) writeFileSync(join(outDir, 'posts', `${post.slug}.md`), `${post.body}\n`);

  // タイムライン。非公開にしたアプリの作業日は出さない
  const activityPath = join(root, 'data', 'activity.json');
  const activity = existsSync(activityPath) ? JSON.parse(readFileSync(activityPath, 'utf8')) : { updatedAt: '', apps: {} };
  const apps = Object.fromEntries(Object.entries(activity.apps).filter(([id]) => context.projectIds.has(id)));
  const goals = allGoals.filter((goal) => context.projectIds.has(goal.project));
  writeFileSync(join(outDir, 'activity.json'), JSON.stringify({ updatedAt: activity.updatedAt, apps, goals }));
}
console.log(`Devlog: ${posts.length} 件を検査${checkOnly ? '' : 'して生成'}した`);
