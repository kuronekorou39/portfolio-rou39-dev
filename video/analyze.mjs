/**
 * 書き出した動画を「AI に読ませられる形」に分解する。
 *
 *   node analyze.mjs [動画のパス]
 *
 * 出すもの:
 *   out/sheet-all.png   全編を 1 秒ごとに並べたコンタクトシート (6x5)
 *   out/sheet-hook.png  冒頭 5 秒を 0.25 秒ごとに並べたシート (5x4)
 *   標準出力            freezedetect による「絵が止まっている区間」の一覧と合計
 *
 * シート画像はそのまま Claude / GPT / Gemini に貼れる。
 * 1 枚ずつ静止画を見ても間合いの問題は見えないが、並べると一目で分かる。
 *
 * ffmpeg に PATH が通っていること。
 */
import { spawnSync } from 'node:child_process';

const SRC = process.argv[2] ?? 'out/stash-notes-32s-9x16.mp4';
const BG = '0x1a1d24';

const ff = (args) => spawnSync('ffmpeg', args, { encoding: 'utf8' });

const sheet = (label, out, extra, vf) => {
  const r = ff(['-y', ...extra, '-i', SRC, '-vf', vf, '-frames:v', '1', out]);
  if (r.status !== 0) {
    console.error(`${label} の生成に失敗\n${r.stderr?.slice(-800)}`);
    process.exit(1);
  }
  console.log(`${label} -> ${out}`);
};

sheet(
  '全編 1 秒ごと',
  'out/sheet-all.png',
  [],
  `fps=1,scale=240:-1,tile=6x5:padding=8:margin=8:color=${BG}`,
);
sheet(
  '冒頭 5 秒 0.25 秒ごと',
  'out/sheet-hook.png',
  ['-t', '5'],
  `fps=4,scale=330:-1,tile=5x4:padding=8:margin=8:color=${BG}`,
);

// 絵が止まっている区間。SNS 広告では止まった瞬間にスワイプされるので、
// ここが長いほど致命的になる。
const probe = ff(['-i', SRC, '-vf', 'freezedetect=n=-50dB:d=0.7', '-map', '0:v', '-f', 'null', '-']);
const log = probe.stderr ?? '';

const num = (key) =>
  [...log.matchAll(new RegExp(`lavfi\\.freezedetect\\.${key}:\\s*([0-9.]+)`, 'g'))].map((m) =>
    Number(m[1]),
  );
const starts = num('freeze_start');
const durations = num('freeze_duration');

const dur = log.match(/Duration:\s*(\d+):(\d+):([0-9.]+)/);
const total = dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : 0;

console.log('\n静止している区間:');
let frozen = 0;
starts.forEach((s, i) => {
  const d = durations[i] ?? 0;
  frozen += d;
  const bar = '#'.repeat(Math.max(1, Math.round(d * 4)));
  console.log(`  ${s.toFixed(1).padStart(5)}s - ${(s + d).toFixed(1).padStart(5)}s  ${d.toFixed(2)}s  ${bar}`);
});
console.log(
  `\n合計 ${frozen.toFixed(1)}s / ${total.toFixed(1)}s = ${((frozen / total) * 100).toFixed(0)}% が静止`,
);
