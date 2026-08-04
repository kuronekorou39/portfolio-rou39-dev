// 3 比率をまとめて書き出す。`npm run render` から呼ばれる。
// 個別に出したいときは npm run render:vertical / :landscape / :square。
import { spawnSync } from 'node:child_process';

const TARGETS = [
  ['StashNotes32-Vertical', 'out/stash-notes-32s-9x16.mp4'],
  ['StashNotes32-Landscape', 'out/stash-notes-32s-16x9.mp4'],
  ['StashNotes32-Square', 'out/stash-notes-32s-1x1.mp4'],
];

for (const [id, out] of TARGETS) {
  console.log(`\n=== ${id} -> ${out} ===`);
  const r = spawnSync('npx', ['remotion', 'render', id, out], { stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`${id} のレンダリングに失敗しました`);
    process.exit(r.status ?? 1);
  }
}

console.log('\n完了。out/ に 3 本できています。');
