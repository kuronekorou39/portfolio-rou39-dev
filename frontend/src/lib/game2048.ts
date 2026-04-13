export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Tile {
  id: number;
  value: number;
  row: number;
  col: number;
}

export interface MoveResult {
  tiles: Tile[];
  mergedIds: Set<number>;
  score: number;
  moved: boolean;
}

// ── Seeded PRNG (Mulberry32) ──

export function createPRNG(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Tile ID management ──

let tileIdCounter = 0;

function nextId(): number {
  return ++tileIdCounter;
}

function resetIds(): void {
  tileIdCounter = 0;
}

// ── Grid utilities ──

function getEmptyPositions(tiles: Tile[], size: number): [number, number][] {
  const occupied = new Set(tiles.map(t => `${t.row},${t.col}`));
  const empty: [number, number][] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!occupied.has(`${r},${c}`)) {
        empty.push([r, c]);
      }
    }
  }
  return empty;
}

export function addRandomTile(
  tiles: Tile[],
  size: number,
  random: () => number = Math.random,
): Tile | null {
  const empty = getEmptyPositions(tiles, size);
  if (empty.length === 0) return null;
  const [row, col] = empty[Math.floor(random() * empty.length)];
  return {
    id: nextId(),
    value: random() < 0.9 ? 2 : 4,
    row,
    col,
  };
}

export function createInitialTiles(
  size: number,
  random: () => number = Math.random,
): Tile[] {
  resetIds();
  const tiles: Tile[] = [];
  for (let i = 0; i < 2; i++) {
    const tile = addRandomTile(tiles, size, random);
    if (tile) tiles.push(tile);
  }
  return tiles;
}

// ── Replay verification ──

export function verifyReplay(
  seed: number,
  boardSize: number,
  tilesPerMove: number,
  moves: Direction[],
  claimedScore: number,
): boolean {
  const random = createPRNG(seed);
  let tiles = createInitialTiles(boardSize, random);
  let score = 0;

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

  return score === claimedScore;
}

// ── Move logic ──

function slideLine(
  lineTiles: { id: number; value: number }[],
): {
  result: { id: number; value: number }[];
  mergedIds: number[];
  score: number;
} {
  const result: { id: number; value: number }[] = [];
  const mergedIds: number[] = [];
  let score = 0;
  let i = 0;

  while (i < lineTiles.length) {
    if (
      i + 1 < lineTiles.length &&
      lineTiles[i].value === lineTiles[i + 1].value
    ) {
      const newValue = lineTiles[i].value * 2;
      result.push({ id: lineTiles[i].id, value: newValue });
      mergedIds.push(lineTiles[i].id);
      score += newValue;
      i += 2;
    } else {
      result.push({ id: lineTiles[i].id, value: lineTiles[i].value });
      i++;
    }
  }

  return { result, mergedIds, score };
}

export function processMove(
  tiles: Tile[],
  direction: Direction,
  size: number,
): MoveResult {
  const isHorizontal = direction === 'left' || direction === 'right';
  const isReversed = direction === 'right' || direction === 'down';

  const resultTiles: Tile[] = [];
  const allMergedIds = new Set<number>();
  let totalScore = 0;
  let moved = false;

  for (let lineIdx = 0; lineIdx < size; lineIdx++) {
    const lineTiles = tiles
      .filter(t => (isHorizontal ? t.row : t.col) === lineIdx)
      .sort((a, b) => {
        const posA = isHorizontal ? a.col : a.row;
        const posB = isHorizontal ? b.col : b.row;
        return isReversed ? posB - posA : posA - posB;
      });

    const { result, mergedIds, score } = slideLine(
      lineTiles.map(t => ({ id: t.id, value: t.value })),
    );

    for (let j = 0; j < result.length; j++) {
      const pos = isReversed ? size - 1 - j : j;
      const newRow = isHorizontal ? lineIdx : pos;
      const newCol = isHorizontal ? pos : lineIdx;

      const original = tiles.find(t => t.id === result[j].id)!;
      if (
        original.row !== newRow ||
        original.col !== newCol ||
        result[j].value !== original.value
      ) {
        moved = true;
      }

      resultTiles.push({
        id: result[j].id,
        value: result[j].value,
        row: newRow,
        col: newCol,
      });
    }

    mergedIds.forEach(id => allMergedIds.add(id));
    totalScore += score;
  }

  return {
    tiles: resultTiles,
    mergedIds: allMergedIds,
    score: totalScore,
    moved,
  };
}

export function canMove(tiles: Tile[], size: number): boolean {
  if (tiles.length < size * size) return true;

  const grid: number[][] = Array.from({ length: size }, () =>
    Array(size).fill(0),
  );
  for (const tile of tiles) {
    grid[tile.row][tile.col] = tile.value;
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const val = grid[r][c];
      if (c + 1 < size && grid[r][c + 1] === val) return true;
      if (r + 1 < size && grid[r + 1][c] === val) return true;
    }
  }

  return false;
}

// ── Visual styles ──

const TILE_STYLES: Record<number, { bg: string; text: string; shadow: string }> =
  {
    2: { bg: '#1a1a2e', text: '#6b6b8a', shadow: 'none' },
    4: { bg: '#1e1e38', text: '#8888ab', shadow: 'none' },
    8: { bg: '#162640', text: '#5b9bd5', shadow: '0 0 10px rgba(91,155,213,0.2)' },
    16: { bg: '#163040', text: '#4ecdc4', shadow: '0 0 12px rgba(78,205,196,0.25)' },
    32: { bg: '#163828', text: '#2dd4a8', shadow: '0 0 12px rgba(45,212,168,0.25)' },
    64: { bg: '#283818', text: '#a3e635', shadow: '0 0 14px rgba(163,230,53,0.3)' },
    128: { bg: '#383418', text: '#fbbf24', shadow: '0 0 16px rgba(251,191,36,0.35)' },
    256: { bg: '#382818', text: '#fb923c', shadow: '0 0 18px rgba(251,146,60,0.4)' },
    512: { bg: '#381818', text: '#f87171', shadow: '0 0 20px rgba(248,113,113,0.4)' },
    1024: { bg: '#381838', text: '#e879f9', shadow: '0 0 22px rgba(232,121,249,0.45)' },
    2048: { bg: '#382808', text: '#ffd700', shadow: '0 0 30px rgba(255,215,0,0.6)' },
    4096: { bg: '#280838', text: '#c084fc', shadow: '0 0 28px rgba(192,132,252,0.5)' },
    8192: { bg: '#083838', text: '#67e8f9', shadow: '0 0 28px rgba(103,232,249,0.5)' },
  };

export function getTileStyle(value: number): {
  bg: string;
  text: string;
  shadow: string;
} {
  return (
    TILE_STYLES[value] || {
      bg: '#1a0a2e',
      text: '#ffffff',
      shadow: '0 0 30px rgba(255,255,255,0.5)',
    }
  );
}

export function getTileFontSize(value: number, cellSize: number): number {
  if (value < 100) return cellSize * 0.42;
  if (value < 1000) return cellSize * 0.34;
  if (value < 10000) return cellSize * 0.26;
  return cellSize * 0.2;
}
