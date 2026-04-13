import { describe, it, expect } from 'vitest';
import {
  type Tile,
  type Direction,
  createPRNG,
  createInitialTiles,
  addRandomTile,
  processMove,
  canMove,
  verifyReplay,
  getTileStyle,
  getTileFontSize,
} from './game2048';

// ── Helpers ──

/** グリッド配列 (0=空) からタイル配列を生成。テスト用。 */
function makeTiles(grid: number[][]): Tile[] {
  const tiles: Tile[] = [];
  let id = 1;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] !== 0) {
        tiles.push({ id: id++, value: grid[r][c], row: r, col: c });
      }
    }
  }
  return tiles;
}

/** タイル配列をグリッド配列に変換。アサーション用。 */
function toGrid(tiles: Tile[], size: number): number[][] {
  const grid = Array.from({ length: size }, () => Array(size).fill(0));
  for (const t of tiles) {
    grid[t.row][t.col] = t.value;
  }
  return grid;
}

// ============================================================
// processMove — 左移動
// ============================================================
describe('processMove: left', () => {
  const dir: Direction = 'left';
  const size = 4;

  it('空きスペースに向かってスライドする', () => {
    const tiles = makeTiles([
      [0, 0, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = processMove(tiles, dir, size);
    expect(toGrid(result.tiles, size)[0]).toEqual([2, 0, 0, 0]);
    expect(result.moved).toBe(true);
    expect(result.score).toBe(0);
  });

  it('同じ値のペアがマージされる', () => {
    const tiles = makeTiles([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = processMove(tiles, dir, size);
    expect(toGrid(result.tiles, size)[0]).toEqual([4, 0, 0, 0]);
    expect(result.score).toBe(4);
    expect(result.moved).toBe(true);
  });

  it('離れていても同じ値ならマージされる', () => {
    const tiles = makeTiles([
      [2, 0, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = processMove(tiles, dir, size);
    expect(toGrid(result.tiles, size)[0]).toEqual([4, 0, 0, 0]);
    expect(result.score).toBe(4);
  });

  it('[2,2,2,2] → 2回マージで [4,4,0,0]', () => {
    const tiles = makeTiles([
      [2, 2, 2, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = processMove(tiles, dir, size);
    expect(toGrid(result.tiles, size)[0]).toEqual([4, 4, 0, 0]);
    expect(result.score).toBe(8);
  });

  it('[2,2,2,0] → 先頭ペアだけマージ [4,2,0,0]', () => {
    const tiles = makeTiles([
      [2, 2, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = processMove(tiles, dir, size);
    expect(toGrid(result.tiles, size)[0]).toEqual([4, 2, 0, 0]);
    expect(result.score).toBe(4);
  });

  it('異なる値はマージされない', () => {
    const tiles = makeTiles([
      [2, 4, 8, 16],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = processMove(tiles, dir, size);
    expect(toGrid(result.tiles, size)[0]).toEqual([2, 4, 8, 16]);
    expect(result.moved).toBe(false);
    expect(result.score).toBe(0);
  });

  it('すでに左寄せで動かない場合 moved=false', () => {
    const tiles = makeTiles([
      [2, 4, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = processMove(tiles, dir, size);
    expect(result.moved).toBe(false);
  });

  it('複数行が同時に処理される', () => {
    const tiles = makeTiles([
      [0, 2, 0, 2],
      [4, 0, 4, 0],
      [0, 0, 0, 8],
      [16, 16, 0, 0],
    ]);
    const result = processMove(tiles, dir, size);
    const grid = toGrid(result.tiles, size);
    expect(grid[0]).toEqual([4, 0, 0, 0]);
    expect(grid[1]).toEqual([8, 0, 0, 0]);
    expect(grid[2]).toEqual([8, 0, 0, 0]);
    expect(grid[3]).toEqual([32, 0, 0, 0]);
    expect(result.score).toBe(4 + 8 + 32);
  });
});

// ============================================================
// processMove — 右移動
// ============================================================
describe('processMove: right', () => {
  const dir: Direction = 'right';
  const size = 4;

  it('右端に向かってスライドする', () => {
    const tiles = makeTiles([
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = processMove(tiles, dir, size);
    expect(toGrid(result.tiles, size)[0]).toEqual([0, 0, 0, 2]);
    expect(result.moved).toBe(true);
  });

  it('右端でマージされる', () => {
    const tiles = makeTiles([
      [0, 0, 2, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = processMove(tiles, dir, size);
    expect(toGrid(result.tiles, size)[0]).toEqual([0, 0, 0, 4]);
    expect(result.score).toBe(4);
  });

  it('[2,2,2,2] → [0,0,4,4]', () => {
    const tiles = makeTiles([
      [2, 2, 2, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = processMove(tiles, dir, size);
    expect(toGrid(result.tiles, size)[0]).toEqual([0, 0, 4, 4]);
    expect(result.score).toBe(8);
  });

  it('すでに右寄せで動かない場合 moved=false', () => {
    const tiles = makeTiles([
      [0, 0, 4, 8],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = processMove(tiles, dir, size);
    expect(result.moved).toBe(false);
  });
});

// ============================================================
// processMove — 上移動
// ============================================================
describe('processMove: up', () => {
  const dir: Direction = 'up';
  const size = 4;

  it('上にスライドする', () => {
    const tiles = makeTiles([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [2, 0, 0, 0],
    ]);
    const result = processMove(tiles, dir, size);
    expect(toGrid(result.tiles, size)).toEqual([
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(result.moved).toBe(true);
  });

  it('上方向でマージされる', () => {
    const tiles = makeTiles([
      [2, 0, 0, 0],
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = processMove(tiles, dir, size);
    expect(toGrid(result.tiles, size)).toEqual([
      [4, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(result.score).toBe(4);
  });

  it('縦4つ同値 → 上で2回マージ', () => {
    const tiles = makeTiles([
      [4, 0, 0, 0],
      [4, 0, 0, 0],
      [4, 0, 0, 0],
      [4, 0, 0, 0],
    ]);
    const result = processMove(tiles, dir, size);
    const grid = toGrid(result.tiles, size);
    expect(grid[0][0]).toBe(8);
    expect(grid[1][0]).toBe(8);
    expect(grid[2][0]).toBe(0);
    expect(grid[3][0]).toBe(0);
    expect(result.score).toBe(16);
  });
});

// ============================================================
// processMove — 下移動
// ============================================================
describe('processMove: down', () => {
  const dir: Direction = 'down';
  const size = 4;

  it('下にスライドする', () => {
    const tiles = makeTiles([
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = processMove(tiles, dir, size);
    expect(toGrid(result.tiles, size)).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [2, 0, 0, 0],
    ]);
    expect(result.moved).toBe(true);
  });

  it('下方向でマージされる', () => {
    const tiles = makeTiles([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [4, 0, 0, 0],
      [4, 0, 0, 0],
    ]);
    const result = processMove(tiles, dir, size);
    expect(toGrid(result.tiles, size)).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [8, 0, 0, 0],
    ]);
    expect(result.score).toBe(8);
  });

  it('[2,2,4,4] 縦 → 下に [0,0,4,8]', () => {
    const tiles = makeTiles([
      [2, 0, 0, 0],
      [2, 0, 0, 0],
      [4, 0, 0, 0],
      [4, 0, 0, 0],
    ]);
    const result = processMove(tiles, dir, size);
    const col0 = toGrid(result.tiles, size).map(row => row[0]);
    expect(col0).toEqual([0, 0, 4, 8]);
    expect(result.score).toBe(4 + 8);
  });
});

// ============================================================
// processMove — タイルIDの安定性
// ============================================================
describe('processMove: tile ID stability', () => {
  it('動かなかったタイルは同じIDを保持する', () => {
    const tiles = makeTiles([
      [2, 4, 8, 16],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const originalIds = tiles.map(t => t.id);
    const result = processMove(tiles, 'left', 4);
    const resultIds = result.tiles.map(t => t.id);
    expect(resultIds).toEqual(originalIds);
  });

  it('マージ時は一方のIDが生き残る', () => {
    const tiles = makeTiles([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const originalIds = new Set(tiles.map(t => t.id));
    const result = processMove(tiles, 'left', 4);
    expect(result.tiles).toHaveLength(1);
    expect(originalIds.has(result.tiles[0].id)).toBe(true);
  });

  it('mergedIds にマージ後のタイルIDが含まれる', () => {
    const tiles = makeTiles([
      [4, 4, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = processMove(tiles, 'left', 4);
    expect(result.mergedIds.size).toBe(1);
    expect(result.mergedIds.has(result.tiles[0].id)).toBe(true);
  });
});

// ============================================================
// processMove — スコア計算
// ============================================================
describe('processMove: scoring', () => {
  it('マージなしならスコア0', () => {
    const tiles = makeTiles([
      [2, 4, 0, 0],
      [0, 0, 0, 8],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = processMove(tiles, 'left', 4);
    expect(result.score).toBe(0);
  });

  it('複数のマージのスコアが合算される', () => {
    const tiles = makeTiles([
      [2, 2, 0, 0],
      [8, 8, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = processMove(tiles, 'left', 4);
    expect(result.score).toBe(4 + 16);
  });

  it('大きい値のマージも正しいスコア', () => {
    const tiles = makeTiles([
      [1024, 1024, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = processMove(tiles, 'left', 4);
    expect(result.score).toBe(2048);
    expect(result.tiles[0].value).toBe(2048);
  });
});

// ============================================================
// canMove
// ============================================================
describe('canMove', () => {
  it('空きセルがあれば true', () => {
    const tiles = makeTiles([
      [2, 4, 8, 16],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(canMove(tiles, 4)).toBe(true);
  });

  it('満杯でも隣接する同値があれば true (横)', () => {
    const tiles = makeTiles([
      [2, 4, 8, 16],
      [32, 64, 128, 256],
      [512, 1024, 2, 4],
      [8, 16, 32, 32],
    ]);
    expect(canMove(tiles, 4)).toBe(true);
  });

  it('満杯でも隣接する同値があれば true (縦)', () => {
    const tiles = makeTiles([
      [2, 4, 8, 16],
      [32, 64, 128, 256],
      [512, 1024, 2, 4],
      [8, 1024, 32, 64],
    ]);
    expect(canMove(tiles, 4)).toBe(true);
  });

  it('満杯で隣接同値なし → false (ゲームオーバー)', () => {
    const tiles = makeTiles([
      [2, 4, 8, 16],
      [32, 64, 128, 256],
      [2, 4, 8, 16],
      [32, 64, 128, 256],
    ]);
    expect(canMove(tiles, 4)).toBe(false);
  });

  it('空のボード → true', () => {
    expect(canMove([], 4)).toBe(true);
  });
});

// ============================================================
// createInitialTiles
// ============================================================
describe('createInitialTiles', () => {
  it('2つのタイルが生成される', () => {
    const tiles = createInitialTiles(4);
    expect(tiles).toHaveLength(2);
  });

  it('各タイルの値は2か4', () => {
    for (let i = 0; i < 20; i++) {
      const tiles = createInitialTiles(4);
      for (const t of tiles) {
        expect([2, 4]).toContain(t.value);
      }
    }
  });

  it('2つのタイルは別々の位置にある', () => {
    for (let i = 0; i < 20; i++) {
      const tiles = createInitialTiles(4);
      const pos0 = `${tiles[0].row},${tiles[0].col}`;
      const pos1 = `${tiles[1].row},${tiles[1].col}`;
      expect(pos0).not.toBe(pos1);
    }
  });

  it('タイルIDはユニーク', () => {
    const tiles = createInitialTiles(4);
    expect(tiles[0].id).not.toBe(tiles[1].id);
  });

  it('位置はボードの範囲内', () => {
    for (let i = 0; i < 20; i++) {
      const tiles = createInitialTiles(4);
      for (const t of tiles) {
        expect(t.row).toBeGreaterThanOrEqual(0);
        expect(t.row).toBeLessThan(4);
        expect(t.col).toBeGreaterThanOrEqual(0);
        expect(t.col).toBeLessThan(4);
      }
    }
  });
});

// ============================================================
// addRandomTile
// ============================================================
describe('addRandomTile', () => {
  it('空きセルに追加される', () => {
    const existing = makeTiles([
      [2, 4, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const newTile = addRandomTile(existing, 4);
    expect(newTile).not.toBeNull();
    // 既存タイルと位置が被らない
    for (const t of existing) {
      expect(`${newTile!.row},${newTile!.col}`).not.toBe(`${t.row},${t.col}`);
    }
  });

  it('値は2か4', () => {
    const existing: Tile[] = [];
    for (let i = 0; i < 50; i++) {
      const t = addRandomTile(existing, 4);
      expect(t).not.toBeNull();
      expect([2, 4]).toContain(t!.value);
    }
  });

  it('満杯のボードでは null', () => {
    const full = makeTiles([
      [2, 4, 8, 16],
      [32, 64, 128, 256],
      [512, 1024, 2048, 4096],
      [2, 4, 8, 16],
    ]);
    expect(addRandomTile(full, 4)).toBeNull();
  });

  it('残り1マスでも追加できる', () => {
    const almost = makeTiles([
      [2, 4, 8, 16],
      [32, 64, 128, 256],
      [512, 1024, 2048, 4096],
      [2, 4, 8, 0],
    ]);
    const t = addRandomTile(almost, 4);
    expect(t).not.toBeNull();
    expect(t!.row).toBe(3);
    expect(t!.col).toBe(3);
  });
});

// ============================================================
// エッジケース
// ============================================================
describe('edge cases', () => {
  it('[2,8,4,2] を左に動かしても moved=false', () => {
    const tiles = makeTiles([
      [2, 8, 4, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = processMove(tiles, 'left', 4);
    expect(result.moved).toBe(false);
    expect(result.score).toBe(0);
  });

  it('[4,2,4,0] を左 → [4,2,4,0] 値が異なるのでマージなし', () => {
    const tiles = makeTiles([
      [4, 2, 4, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = processMove(tiles, 'left', 4);
    expect(toGrid(result.tiles, 4)[0]).toEqual([4, 2, 4, 0]);
    expect(result.moved).toBe(false);
  });

  it('[2,2,4,4] を左 → [4,8,0,0]', () => {
    const tiles = makeTiles([
      [2, 2, 4, 4],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = processMove(tiles, 'left', 4);
    expect(toGrid(result.tiles, 4)[0]).toEqual([4, 8, 0, 0]);
    expect(result.score).toBe(4 + 8);
  });

  it('[0,2,0,2] を右 → [0,0,0,4]', () => {
    const tiles = makeTiles([
      [0, 2, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = processMove(tiles, 'right', 4);
    expect(toGrid(result.tiles, 4)[0]).toEqual([0, 0, 0, 4]);
  });

  it('3x3ボードでも動作する', () => {
    const tiles: Tile[] = [
      { id: 1, value: 2, row: 0, col: 0 },
      { id: 2, value: 2, row: 0, col: 2 },
    ];
    const result = processMove(tiles, 'left', 3);
    expect(toGrid(result.tiles, 3)[0]).toEqual([4, 0, 0]);
    expect(result.score).toBe(4);
  });

  it('5x5ボードでも動作する', () => {
    const tiles: Tile[] = [
      { id: 1, value: 8, row: 0, col: 0 },
      { id: 2, value: 8, row: 0, col: 4 },
    ];
    const result = processMove(tiles, 'left', 5);
    expect(toGrid(result.tiles, 5)[0]).toEqual([16, 0, 0, 0, 0]);
    expect(result.score).toBe(16);
  });

  it('1手でマージは1回まで (同値が3つ連続)', () => {
    // [2,2,2,0] left → 先頭ペアだけマージ → [4,2,0,0]
    const tiles = makeTiles([
      [2, 2, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = processMove(tiles, 'left', 4);
    expect(toGrid(result.tiles, 4)[0]).toEqual([4, 2, 0, 0]);
  });

  it('タイル位置が重複しない', () => {
    const tiles = makeTiles([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    const result = processMove(tiles, 'left', 4);
    const positions = result.tiles.map(t => `${t.row},${t.col}`);
    const unique = new Set(positions);
    expect(unique.size).toBe(positions.length);
  });
});

// ============================================================
// ゲームオーバー判定 — 1手のフロー全体
// ============================================================
describe('game over: full-move simulation', () => {
  it('1手で最大2個タイルが追加される', () => {
    const initial = createInitialTiles(4);
    const result = processMove(initial, 'left', 4);
    if (result.moved) {
      let current = result.tiles;
      let added = 0;
      for (let i = 0; i < 2; i++) {
        const t = addRandomTile(current, 4);
        if (!t) break;
        current = [...current, t];
        added++;
      }
      expect(added).toBe(2);
      expect(current.length).toBe(result.tiles.length + 2);
    }
  });

  it('残り1マス + 隣接同値あり → タイル追加後もゲーム続行', () => {
    const tiles = makeTiles([
      [2,  4,   8,  16],
      [32, 64, 128, 256],
      [2,  4,   8,  16],
      [32, 64, 128,   0],
    ]);
    // 最後の空きを埋める
    const withNew: Tile[] = [
      ...tiles,
      { id: 99, value: 256, row: 3, col: 3 },
    ];
    // (1,3)=256 と (3,3)=256 は隣接してないが
    // この配置自体は完全互い違いなのでゲームオーバー…ではなく
    // (0,3)=16 と (1,3)=256 → 不一致, (2,3)=16 と (3,3)=256 → 不一致
    // 実際にマッチを作ろう:
    const tilesWithMatch = makeTiles([
      [2,  4,   8,  16],
      [32, 64, 128, 256],
      [2,  4,   8,  16],
      [32, 64,   8,   0],
    ]);
    const full: Tile[] = [
      ...tilesWithMatch,
      { id: 99, value: 32, row: 3, col: 3 },
    ];
    // (2,2)=8 と (3,2)=8 が縦に隣接 → まだ動ける
    expect(canMove(full, 4)).toBe(true);
  });

  it('残り1マス + 隣接同値なし → タイル追加後ゲームオーバー', () => {
    const tiles = makeTiles([
      [2,   4,   8,  16],
      [32,  64, 128, 256],
      [512, 1024, 2,   4],
      [8,   16,  32,   0],
    ]);
    const full: Tile[] = [
      ...tiles,
      { id: 99, value: 64, row: 3, col: 3 },
    ];
    expect(canMove(full, 4)).toBe(false);
  });

  it('空き1マスでも1個だけ追加して続行できる', () => {
    // 15タイル（1空き）、隣接同値あり
    const tiles = makeTiles([
      [2,  4,   8,  16],
      [32, 64, 128, 256],
      [2,  4,   8,  16],
      [32, 64,   8,   0],
    ]);
    // 2個追加を試みるが空き1なので1個だけ入る
    let current: Tile[] = [...tiles];
    let added = 0;
    for (let i = 0; i < 2; i++) {
      const t = addRandomTile(current, 4);
      if (!t) break;
      current = [...current, t];
      added++;
    }
    expect(added).toBe(1);
    expect(current.length).toBe(16);
    // (2,2)=8 と (3,2)=8 が隣接 → まだ動ける
    expect(canMove(current, 4)).toBe(true);
  });

  it('マージで空きが増えれば2個追加できてゲーム続行', () => {
    // 15タイル（1空き）、マージ可能
    const tiles = makeTiles([
      [2,  4,   8,  16],
      [32, 64, 128, 256],
      [512, 1024, 2,  4],
      [4,   4,  32,   0],
    ]);
    // 左に動かす → (3,0)=4と(3,1)=4がマージ → 14タイル → 2空き
    const result = processMove(tiles, 'left', 4);
    expect(result.moved).toBe(true);
    expect(result.tiles.length).toBe(14);

    // 2個追加 → 16タイル
    let current = result.tiles;
    let added = 0;
    for (let i = 0; i < 2; i++) {
      const t = addRandomTile(current, 4);
      if (!t) break;
      current = [...current, t];
      added++;
    }
    expect(added).toBe(2);
    expect(current.length).toBe(16);
  });
});

// ============================================================
// PRNG determinism
// ============================================================
describe('createPRNG', () => {
  it('同一シードから同一シーケンスが生成される', () => {
    const a = createPRNG(42);
    const b = createPRNG(42);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it('異なるシードからは異なるシーケンス', () => {
    const a = createPRNG(1);
    const b = createPRNG(2);
    const same = Array.from({ length: 20 }, () => a() === b());
    expect(same.every(Boolean)).toBe(false);
  });

  it('0以上1未満の値を返す', () => {
    const rng = createPRNG(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('seeded createInitialTiles', () => {
  it('同一シードで同一初期配置', () => {
    const a = createInitialTiles(4, createPRNG(99));
    const b = createInitialTiles(4, createPRNG(99));
    expect(a.map(t => [t.row, t.col, t.value])).toEqual(
      b.map(t => [t.row, t.col, t.value]),
    );
  });
});

// ============================================================
// verifyReplay
// ============================================================
describe('verifyReplay', () => {
  it('正しいリプレイはスコアが一致する', () => {
    const seed = 777;
    const boardSize = 4;
    const tilesPerMove = 2;
    const random = createPRNG(seed);
    let tiles = createInitialTiles(boardSize, random);
    let score = 0;
    const moves: Direction[] = ['left', 'up', 'right', 'down', 'left', 'left', 'up', 'down'];

    for (const dir of moves) {
      const result = processMove(tiles, dir, boardSize);
      if (!result.moved) continue;
      score += result.score;
      tiles = result.tiles;
      for (let i = 0; i < tilesPerMove; i++) {
        const t = addRandomTile(tiles, boardSize, random);
        if (!t) break;
        tiles = [...tiles, t];
      }
    }

    expect(verifyReplay(seed, boardSize, tilesPerMove, moves, score)).toBe(true);
  });

  it('スコアを改ざんすると検証失敗', () => {
    const seed = 777;
    const moves: Direction[] = ['left', 'up', 'right', 'down'];
    expect(verifyReplay(seed, 4, 2, moves, 999999)).toBe(false);
  });

  it('操作を改ざんすると検証失敗', () => {
    const seed = 777;
    const tilesPerMove = 2;
    // 長めの操作で確実にスコアが出る手順
    const realMoves: Direction[] = [
      'left', 'down', 'left', 'down', 'right', 'up',
      'left', 'down', 'right', 'up', 'left', 'left',
    ];
    const random = createPRNG(seed);
    let tiles = createInitialTiles(4, random);
    let score = 0;
    for (const dir of realMoves) {
      const result = processMove(tiles, dir, 4);
      if (!result.moved) continue;
      score += result.score;
      tiles = result.tiles;
      for (let i = 0; i < tilesPerMove; i++) {
        const t = addRandomTile(tiles, 4, random);
        if (!t) break;
        tiles = [...tiles, t];
      }
    }
    expect(score).toBeGreaterThan(0);

    // 全く違う操作列 → 別スコアになるはず
    const fakeMoves: Direction[] = [
      'right', 'up', 'right', 'up', 'left', 'down',
      'right', 'up', 'left', 'down', 'right', 'right',
    ];
    expect(verifyReplay(seed, 4, tilesPerMove, fakeMoves, score)).toBe(false);
  });
});

// ============================================================
// getTileStyle / getTileFontSize
// ============================================================
describe('visual helpers', () => {
  it('既知の値にスタイルが返る', () => {
    for (const val of [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048]) {
      const style = getTileStyle(val);
      expect(style.bg).toBeTruthy();
      expect(style.text).toBeTruthy();
    }
  });

  it('未知の値でもフォールバックが返る', () => {
    const style = getTileStyle(16384);
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
  });

  it('値が大きいほどフォントサイズが小さい', () => {
    const cell = 80;
    expect(getTileFontSize(2, cell)).toBeGreaterThan(getTileFontSize(128, cell));
    expect(getTileFontSize(128, cell)).toBeGreaterThan(getTileFontSize(2048, cell));
    expect(getTileFontSize(2048, cell)).toBeGreaterThan(getTileFontSize(65536, cell));
  });
});
