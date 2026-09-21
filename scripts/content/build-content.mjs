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

if (failures.length > 0) {
  console.error(`Devlog の検査に ${failures.length} 件落ちた。ルールは docs/devlog.md:\n` + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

if (!checkOnly) {
  // 消したログが配信に残らないよう、毎回作り直す
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'posts'), { recursive: true });
  const sorted = sortPosts(posts);
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(sorted.map(({ body: _body, ...meta }) => meta)));
  for (const post of sorted) writeFileSync(join(outDir, 'posts', `${post.slug}.md`), `${post.body}\n`);
}
console.log(`Devlog: ${posts.length} 件を検査${checkOnly ? '' : 'して生成'}した`);
