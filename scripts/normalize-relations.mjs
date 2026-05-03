// FF display/ 配下のフォロー/フォロワーデータを軽量化して
// frontend/public/relations-app/data/depth2.json に出力する。
//
// 入力:
//   - kuronekorou39_following_*.jsonl (4ファイル合計 2.4GB)
//     深さ1 (capturedFromScreenName == kuronekorou39, 2945件) と
//     深さ2 (capturedFromScreenName == 深さ1ユーザー, ~370万件) が混在
//
// 戦略:
//   1. 1パス目で「自分のフォロー先のうち N 人以上が共通でフォローしている人」を集計
//      (単発フォロー = ノイズ なので相関図的に意味薄い)
//   2. 2パス目で残すレコードを抽出:
//      - 深さ1 (from == ROOT_HANDLE) は無条件で全件
//      - 深さ2 は target が threshold 以上の人だけ
//
// 注:深さ1 followers は今回データ無し(取得断念)。followingのみで構成。
//
// 出力スキーマ (loader.js 互換、必要フィールドのみ):
//   { screenName, name, followersCount, friendsCount, avatarUrl?, type, capturedFromScreenName }
//   avatarUrl は1ノードにつき1度だけ含める(同じノードへの重複レコードでは省く)
//   不要削除: id/jobId/restId/description/verified/protected/location/statusesCount/capturedAt
//
// CLI: node scripts/normalize-relations.mjs --threshold=50

import { createReadStream } from 'node:fs';
import { writeFile, mkdir, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC_DIR = resolve(ROOT, 'FF display');
// 出力先は --output で上書き可能(デフォルト depth2.json)
// 例: --output=depth2-local.json (frontend/public/relations-app/data/ 配下に書き出す)
const DATA_DIR = resolve(ROOT, 'frontend/public/relations-app/data/');
const ROOT_HANDLE = 'kuronekorou39';

const SRC_FILES = [
  'kuronekorou39_following_20260429_104940_part01.jsonl',
  'kuronekorou39_following_20260429_104940_part02.jsonl',
  'kuronekorou39_following_20260429_104940_part03.jsonl',
  'kuronekorou39_following_20260429_104940_part04.jsonl',
];

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const OUT_PATH = resolve(DATA_DIR, args.output ?? 'depth2.json');
const THRESHOLD = parseInt(args.threshold ?? '50', 10);

console.log(`しきい値: ${THRESHOLD} (この人数以上の深さ1ユーザーがフォローしているターゲットだけ残す)`);

// ----- パス1: 深さ2 JSONL を全行スキャンして targetCount を集計 -----

async function* iterJSONL(path) {
  const stream = createReadStream(path, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { yield JSON.parse(line); } catch { /* skip */ }
  }
}

console.log('\n[Pass 1/2] JSONL をスキャンして共通フォロー数 + 深さ1セットを集計...');
const t0 = Date.now();
const targetCount = new Map();
const depthOneSet = new Set(); // 自分のフォロー先 (= 深さ1 ノード)
let totalScanned = 0;
let d1RecCount = 0;
for (const f of SRC_FILES) {
  for await (const r of iterJSONL(resolve(SRC_DIR, f))) {
    totalScanned++;
    if (r.capturedFromScreenName === ROOT_HANDLE) {
      d1RecCount++;
      if (r.screenName) depthOneSet.add(r.screenName);
    } else if (r.screenName) {
      targetCount.set(r.screenName, (targetCount.get(r.screenName) || 0) + 1);
    }
  }
  console.log(`  ${f}: 累計 ${totalScanned.toLocaleString()} レコード`);
}
console.log(`Pass 1 完了 (${((Date.now() - t0) / 1000).toFixed(1)}秒): ユニーク target(深さ2) ${targetCount.size.toLocaleString()}, 深さ1ノード ${depthOneSet.size.toLocaleString()}`);

// しきい値別の試算 (target数 と 残るエッジ数)
console.log('\n=== しきい値別の試算 (深さ2分のみ、深さ1の2944は固定で加算) ===');
const thresholds = [50, 100, 200, 300, 500, 1000];
const counts = [...targetCount.values()];
counts.sort((a, b) => b - a);
for (const t of thresholds) {
  let nodes = 0, edges = 0;
  for (const c of counts) {
    if (c >= t) { nodes++; edges += c; } else break; // ソート済みなのでbreakで打切り
  }
  // 1エッジあたりレコード平均約150バイト → サイズ概算
  const totalEdges = edges + d1RecCount;
  const totalNodes = nodes + 2945; // depth1ノード(自分のフォロー先)も常時保持
  const sizeMB = (totalEdges * 150 / 1024 / 1024).toFixed(1);
  const gzipMB = (totalEdges * 150 / 1024 / 1024 / 5).toFixed(1);
  console.log(`  T=${String(t).padStart(4)}: 深さ2ノード=${String(nodes).padStart(7)}+depth1=${totalNodes.toLocaleString().padStart(7)}, エッジ=${totalEdges.toLocaleString().padStart(10)}, 推定サイズ ${sizeMB}MB (gzip ${gzipMB}MB)`);
}
console.log('');

const keepTargets = new Set();
for (const [k, v] of targetCount) if (v >= THRESHOLD) keepTargets.add(k);
console.log(`採用しきい値 >=${THRESHOLD} を満たす深さ2 target: ${keepTargets.size.toLocaleString()}`);

// ----- パス2: 深さ2 JSONL から keepTargets に当たるレコードだけ抽出 -----

console.log('\n[Pass 2/2] 絞り込み + 深さ1 マージ...');
const t1 = Date.now();
const out = [];
// メタフィールド(avatarUrl/restId/statusesCount/verified)は同じノードに対して
// 最初に出会った record にだけ含める(重複を避けてサイズ削減)
const metaSeen = new Set();

function pushRec({ screenName, name, followersCount, friendsCount, avatarUrl, restId, statusesCount, verified, type, from }) {
  if (!screenName || !from) return;
  const rec = {
    screenName,
    name: name || screenName,
    followersCount: followersCount ?? 0,
    friendsCount: friendsCount ?? 0,
    type,
    capturedFromScreenName: from,
  };
  if (!metaSeen.has(screenName)) {
    if (avatarUrl) rec.avatarUrl = avatarUrl;
    if (restId) rec.restId = restId;
    if (statusesCount != null) rec.statusesCount = statusesCount;
    if (verified) rec.verified = true;
    metaSeen.add(screenName);
  }
  out.push(rec);
}

let keptD1 = 0, keptD2Star = 0, keptD2Friend = 0;
for (const f of SRC_FILES) {
  for await (const r of iterJSONL(resolve(SRC_DIR, f))) {
    const isD1 = r.capturedFromScreenName === ROOT_HANDLE;
    const isStar = keepTargets.has(r.screenName);
    // to が「自分のフォロー先」なら、 from が他人(自分のフォロー先)である record も残す
    // → 「自分の周辺コミュニティ内の繋がり」 が見える(VivziePop 問題の本命修正)
    const isToFriend = !isD1 && depthOneSet.has(r.screenName);
    if (!isD1 && !isStar && !isToFriend) continue;
    pushRec({
      screenName: r.screenName,
      name: r.name,
      followersCount: r.followersCount,
      friendsCount: r.friendsCount,
      avatarUrl: r.avatarUrl,
      restId: r.restId,
      statusesCount: r.statusesCount,
      verified: r.verified,
      type: 'following',
      from: r.capturedFromScreenName,
    });
    if (isD1) keptD1++;
    else if (isToFriend) keptD2Friend++;
    else keptD2Star++;
  }
  console.log(`  ${f}: D1=${keptD1.toLocaleString()} D2friend=${keptD2Friend.toLocaleString()} D2star=${keptD2Star.toLocaleString()}`);
}

console.log(`Pass 2 完了 (${((Date.now() - t1) / 1000).toFixed(1)}秒): D1=${keptD1.toLocaleString()} D2friend=${keptD2Friend.toLocaleString()} D2star=${keptD2Star.toLocaleString()} 合計=${out.length.toLocaleString()}`);

// ----- 出力 -----

await mkdir(dirname(OUT_PATH), { recursive: true });
await writeFile(OUT_PATH, JSON.stringify(out), 'utf8');
const sz = (await stat(OUT_PATH)).size;
console.log(`\n書き出し: ${OUT_PATH}`);
console.log(`サイズ: ${(sz / 1024 / 1024).toFixed(2)} MB (生)、 推定gzip: ${(sz / 1024 / 1024 / 5).toFixed(2)} MB`);

// 統計
const uniqSN = new Set(out.map(r => r.screenName));
const uniqFrom = new Set(out.map(r => r.capturedFromScreenName));
const totalNodes = new Set([...uniqSN, ...uniqFrom]).size;
console.log(`ユニーク screenName: ${uniqSN.size.toLocaleString()}`);
console.log(`ユニーク from:       ${uniqFrom.size.toLocaleString()}`);
console.log(`総ユーザー(union):   ${totalNodes.toLocaleString()}`);
