#!/usr/bin/env node
/**
 * サイトの中身が、アプリのリポジトリからどれだけ遅れているかを出す。
 *
 *   npm run status            # 表で出す
 *   npm run status -- --json  # 日ごとのコミット数まで含めて JSON で出す
 *
 * アプリごとに次を調べる:
 *   - 最後のログより後に、コミットのあった日が何日あるか(= まだログにしていない作業日)
 *   - サイトのダウンロード先が、最新のリリースを指しているか
 *
 * アプリとリポジトリの対応は data/sources.json。projects.json は API でそのまま公開されるので、
 * リポジトリ名(private のものもある)はそちらに書かず、分けて持つ。
 *
 * 前提: gh CLI が各リポジトリを読める状態で認証済み。
 */

import { execFile } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parsePost } from './lib.mjs';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DAY_MS = 86_400_000;
const JST_OFFSET_MS = 9 * 3_600_000;
// ログが 1 本も無いアプリは、ここまで遡って作業日を数える
const NO_LOG_LOOKBACK_DAYS = 90;

const asJson = process.argv.includes('--json');

const readJson = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf-8'));
const projects = readJson('data/projects.json');
const sources = readJson('data/sources.json');

const postsDir = join(ROOT, 'data/posts');
const posts = readdirSync(postsDir)
  .map((name) => parsePost(name, readFileSync(join(postsDir, name), 'utf-8')))
  .filter(Boolean);

/** ログの日付は日本時間なので、コミットの時刻も日本時間の日付に直して比べる */
const jstDate = (iso) => new Date(Date.parse(iso) + JST_OFFSET_MS).toISOString().slice(0, 10);
/** 日本時間のその日 0 時を UTC の ISO 文字列で返す */
const jstMidnight = (date) => new Date(Date.parse(`${date}T00:00:00Z`) - JST_OFFSET_MS).toISOString();

async function gh(path, jq) {
  const { stdout } = await run('gh', ['api', '--paginate', path, '--jq', jq], { maxBuffer: 16 * 1024 * 1024 });
  return stdout.split('\n').filter(Boolean);
}

async function inspect(project) {
  const source = sources[project.id];
  const logs = posts.filter((p) => p.projects.includes(project.id)).map((p) => p.date).sort();
  const lastLog = logs.at(-1) ?? null;
  const base = { id: project.id, title: project.title, published: project.published !== false, lastLog };
  if (!source) return { ...base, error: 'data/sources.json に対応が無い' };

  // 最後のログの翌日から数える。同じ日のコミットは、そのログに含まれているとみなす
  const since = lastLog
    ? jstMidnight(new Date(Date.parse(lastLog) + DAY_MS).toISOString().slice(0, 10))
    : new Date(Date.now() - NO_LOG_LOOKBACK_DAYS * DAY_MS).toISOString();
  const query = new URLSearchParams({ since, per_page: '100' });
  if (source.path) query.set('path', source.path);

  try {
    const [info, dates, tags] = await Promise.all([
      gh(`repos/${source.repo}`, '.private'),
      gh(`repos/${source.repo}/commits?${query}`, '.[].commit.author.date'),
      gh(`repos/${source.repo}/releases?per_page=100`, '.[] | select(.draft or .prerelease | not) | .tag_name'),
    ]);

    const days = {};
    for (const iso of dates) {
      const date = jstDate(iso);
      days[date] = (days[date] ?? 0) + 1;
    }

    // 1 つのリポジトリに複数のアプリがあるときは、タグの頭でそのアプリのリリースだけを拾う
    const prefix = source.tagPrefix ?? '';
    const latestTag = tags.find((tag) => tag.startsWith(prefix)) ?? null;
    const latest = latestTag ? latestTag.slice(prefix.length).replace(/^v/, '') : null;
    // ダウンロード先の URL に最新の版番号が入っていなければ、古い版を指している
    const stale = (project.downloads ?? []).filter((d) => latest && !d.url.includes(latest));

    return {
      ...base,
      repo: source.repo,
      private: info[0] === 'true',
      // 公開ページに載せたリンクが private のリポジトリを指していると、訪問者には 404 になる
      deadLink: info[0] === 'true' && !!project.links?.github,
      commits: dates.length,
      days,
      latest,
      stale: stale.map((d) => ({ os: d.os, version: /\d+\.\d+(?:\.\d+)*/.exec(new URL(d.url).pathname)?.[0] ?? '?' })),
    };
  } catch (err) {
    return { ...base, repo: source.repo, error: (err.stderr || err.message).trim().split('\n')[0] };
  }
}

const results = await Promise.all(projects.map(inspect));

if (asJson) {
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

// 全角は 2 桁ぶんの幅を取る。桁を揃えるために表示幅で詰める
const width = (s) => [...s].reduce((n, ch) => n + (ch.charCodeAt(0) > 0xff ? 2 : 1), 0);
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - width(s)));

const rows = results
  .filter((r) => !r.error)
  .map((r) => {
    const dates = Object.keys(r.days).sort();
    const notes = [];
    for (const s of r.stale) notes.push(`${s.os} ${s.version} → ${r.latest}`);
    if (r.deadLink) notes.push('リンク先が private');
    if (!r.published) notes.push('非公開');
    return {
      workDays: dates.length,
      cells: [
        r.title,
        r.lastLog ?? '-',
        dates.length ? `${dates.length} 日` : '',
        r.commits ? String(r.commits) : '',
        dates.length ? `${dates[0].slice(5)}〜${dates.at(-1).slice(5)}` : '',
        notes.join(' / '),
      ],
    };
  })
  .sort((a, b) => b.workDays - a.workDays);

const header = ['アプリ', '最後のログ', '未記録', 'コミット', '期間', 'ダウンロード先・リンク'];
const widths = header.map((h, i) => Math.max(width(h), ...rows.map((r) => width(r.cells[i]))));
const line = (cells) => cells.map((c, i) => pad(c, widths[i])).join('  ').trimEnd();

console.log(line(header));
console.log(widths.map((w) => '-'.repeat(w)).join('  '));
for (const row of rows) console.log(line(row.cells));

const behind = rows.filter((r) => r.workDays > 0);
console.log(`\nログにしていない作業日: ${behind.reduce((n, r) => n + r.workDays, 0)} 日 (${behind.length} アプリ)`);
console.log(`ログが無いアプリは直近 ${NO_LOG_LOOKBACK_DAYS} 日を数えている`);

const errors = results.filter((r) => r.error);
if (errors.length) {
  console.log('\n調べられなかったアプリ:');
  for (const r of errors) console.log(`  ${r.id}: ${r.error}`);
}
