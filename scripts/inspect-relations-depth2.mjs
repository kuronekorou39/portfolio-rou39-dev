// 深さ2 JSONL を集計だけする(変換はしない)。
// データの規模感を把握して、前処理戦略を決めるための調査スクリプト。

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

const FILES = [
  'FF display/kuronekorou39_following_20260429_104940_part01.jsonl',
  'FF display/kuronekorou39_following_20260429_104940_part02.jsonl',
  'FF display/kuronekorou39_following_20260429_104940_part03.jsonl',
  'FF display/kuronekorou39_following_20260429_104940_part04.jsonl',
];

const ROOT = resolve(import.meta.dirname, '..');

let total = 0;
let parseErr = 0;
const fromCount = new Map();      // capturedFromScreenName(=深さ1の人) -> その人のフォロー件数
const targetCount = new Map();    // screenName(被フォロー) -> 何人にフォローされてるか
const protectedCount = { yes: 0, no: 0 };

function bump(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

async function processFile(path) {
  const stream = createReadStream(resolve(ROOT, path), { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let n = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { parseErr++; continue; }
    total++; n++;
    if (r.capturedFromScreenName) bump(fromCount, r.capturedFromScreenName);
    if (r.screenName) bump(targetCount, r.screenName);
    if (r.protected) protectedCount.yes++; else protectedCount.no++;
  }
  console.log(`  ${path.split('/').pop()}: ${n.toLocaleString()} レコード`);
}

console.log('集計開始 (4ファイル順次ストリーミング)...');
const t0 = Date.now();
for (const f of FILES) await processFile(f);
const sec = ((Date.now() - t0) / 1000).toFixed(1);

console.log('\n=== 全体 ===');
console.log(`総レコード数:           ${total.toLocaleString()}`);
console.log(`パースエラー:           ${parseErr.toLocaleString()}`);
console.log(`ユニーク "from"(深さ1): ${fromCount.size.toLocaleString()}`);
console.log(`ユニーク "target":      ${targetCount.size.toLocaleString()}`);
console.log(`protected アカウント:   ${protectedCount.yes.toLocaleString()} / ${(protectedCount.yes + protectedCount.no).toLocaleString()}`);
console.log(`処理時間:               ${sec}秒`);

// target の被フォロー数分布(共通の友人をどこで切るかの判断材料)
const targetFreqs = [...targetCount.values()];
const buckets = { '1人だけ': 0, '2-4人': 0, '5-9人': 0, '10-49人': 0, '50-99人': 0, '100人以上': 0 };
for (const c of targetFreqs) {
  if (c === 1) buckets['1人だけ']++;
  else if (c < 5) buckets['2-4人']++;
  else if (c < 10) buckets['5-9人']++;
  else if (c < 50) buckets['10-49人']++;
  else if (c < 100) buckets['50-99人']++;
  else buckets['100人以上']++;
}
console.log('\n=== 被フォロー数の分布(深さ1ユーザーのうち何人がこの人をフォローしているか) ===');
for (const [k, v] of Object.entries(buckets)) {
  const pct = ((v / targetCount.size) * 100).toFixed(1);
  console.log(`  ${k.padEnd(10)} ${v.toLocaleString().padStart(10)} (${pct}%)`);
}

// from 側の偏り(極端に多くフォローしてる人がデータを膨らませてないか)
const fromFreqs = [...fromCount.entries()].sort((a, b) => b[1] - a[1]);
console.log('\n=== "from"(深さ1ユーザー)の上位10名のフォロー数 ===');
for (const [k, v] of fromFreqs.slice(0, 10)) {
  console.log(`  ${k.padEnd(20)} ${v.toLocaleString()}`);
}

const sumTop100 = fromFreqs.slice(0, 100).reduce((s, [, v]) => s + v, 0);
const sumTop500 = fromFreqs.slice(0, 500).reduce((s, [, v]) => s + v, 0);
console.log(`\n上位 100名 で合計 ${sumTop100.toLocaleString()} レコード (全体の ${((sumTop100 / total) * 100).toFixed(1)}%)`);
console.log(`上位 500名 で合計 ${sumTop500.toLocaleString()} レコード (全体の ${((sumTop500 / total) * 100).toFixed(1)}%)`);
