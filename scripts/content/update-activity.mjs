#!/usr/bin/env node
/**
 * タイムライン(/timeline)に出す、アプリごと・日ごとのコミット件数を集めて data/activity.json に書く。
 *
 *   npm run activity
 *   npm run activity -- --since 2025-01-01   # 古い日まで集め直す(タイムラインの左端)
 *
 * 公開中のアプリだけを、手元の gh の認証で読む。private のリポジトリも数えられるが、
 * 書き出すのは日付と件数だけ(コミットの文面やリポジトリ名は出さない)。
 * 集め直すのは直近 WINDOW_DAYS 日ぶん(--since で変えられる)で、それより古い日は前回までの値を残す。
 *
 * 書いたあとは、npm run publish:devlog か push でサイトに出る。
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'data/activity.json');
const DAY_MS = 86_400_000;
const JST_OFFSET_MS = 9 * 3_600_000;
const WINDOW_DAYS = 180;

const readJson = (path) => JSON.parse(readFileSync(path, 'utf-8'));
const projects = readJson(join(ROOT, 'data/projects.json')).filter((p) => p.published !== false);
const sources = readJson(join(ROOT, 'data/sources.json'));
const previous = existsSync(OUT) ? readJson(OUT).apps ?? {} : {};

/** ログの日付に合わせて、コミットの時刻を日本時間の日付に直す */
const jstDate = (ms) => new Date(ms + JST_OFFSET_MS).toISOString().slice(0, 10);
const sinceArg = process.argv[process.argv.indexOf('--since') + 1];
const sinceMs = process.argv.includes('--since')
  ? Date.parse(`${sinceArg}T00:00:00+09:00`)
  : Date.now() - WINDOW_DAYS * DAY_MS;
if (Number.isNaN(sinceMs)) throw new Error('--since は YYYY-MM-DD で書く');
const windowStart = jstDate(sinceMs);

async function collect(project) {
  const source = sources[project.id];
  if (!source) throw new Error('data/sources.json に対応が無い');
  const query = new URLSearchParams({ since: new Date(sinceMs).toISOString(), per_page: '100' });
  if (source.path) query.set('path', source.path);
  const { stdout } = await run(
    'gh',
    ['api', '--paginate', `repos/${source.repo}/commits?${query}`, '--jq', '.[].commit.author.date'],
    { maxBuffer: 16 * 1024 * 1024 },
  );

  // 集め直す期間より前の日は、前回の値をそのまま残す
  const days = Object.fromEntries(Object.entries(previous[project.id] ?? {}).filter(([date]) => date < windowStart));
  for (const iso of stdout.split('\n').filter(Boolean)) {
    const date = jstDate(Date.parse(iso));
    if (date >= windowStart) days[date] = (days[date] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b)));
}

const apps = {};
let failed = false;
for (const project of projects) {
  try {
    apps[project.id] = await collect(project);
    const recent = Object.entries(apps[project.id]).filter(([date]) => date >= windowStart);
    console.log(`${project.title}: ${recent.length} 日 / ${recent.reduce((n, [, c]) => n + c, 0)} コミット`);
  } catch (err) {
    failed = true;
    // 読めなかったアプリは前回の値を残す。空で上書きすると、タイムラインから作業が消える
    if (previous[project.id]) apps[project.id] = previous[project.id];
    console.error(`${project.title}: 集められなかった(${(err.stderr || err.message).trim().split('\n')[0]})`);
  }
}

writeFileSync(OUT, `${JSON.stringify({ updatedAt: jstDate(Date.now()), apps }, null, 2)}\n`);
console.log(`data/activity.json に書いた(${windowStart} 以降を集め直した)`);
if (failed) process.exit(1);
