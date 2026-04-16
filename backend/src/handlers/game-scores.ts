import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
} from 'aws-lambda';
import { PutCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/dynamo';
import { ok, created, badRequest, serverError } from '../lib/response';
import { randomUUID } from 'crypto';

const TABLE = process.env.GAME_SCORES_TABLE!;

// ================================================================
// Replay verification — game logic (mirrored from frontend)
// ================================================================

type Direction = 'up' | 'down' | 'left' | 'right';

interface Tile {
  id: number;
  value: number;
  row: number;
  col: number;
}

let tileIdCounter = 0;
function nextId(): number {
  return ++tileIdCounter;
}
function resetIds(): void {
  tileIdCounter = 0;
}

function createPRNG(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getEmptyPositions(tiles: Tile[], size: number): [number, number][] {
  const occupied = new Set(tiles.map(t => `${t.row},${t.col}`));
  const empty: [number, number][] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!occupied.has(`${r},${c}`)) empty.push([r, c]);
    }
  }
  return empty;
}

function addRandomTile(
  tiles: Tile[],
  size: number,
  random: () => number,
): Tile | null {
  const empty = getEmptyPositions(tiles, size);
  if (empty.length === 0) return null;
  const [row, col] = empty[Math.floor(random() * empty.length)];
  return { id: nextId(), value: random() < 0.9 ? 2 : 4, row, col };
}

function createInitialTiles(size: number, random: () => number): Tile[] {
  resetIds();
  const tiles: Tile[] = [];
  for (let i = 0; i < 2; i++) {
    const t = addRandomTile(tiles, size, random);
    if (t) tiles.push(t);
  }
  return tiles;
}

function slideLine(lineTiles: { id: number; value: number }[]) {
  const result: { id: number; value: number }[] = [];
  let score = 0;
  let i = 0;
  while (i < lineTiles.length) {
    if (
      i + 1 < lineTiles.length &&
      lineTiles[i].value === lineTiles[i + 1].value
    ) {
      const v = lineTiles[i].value * 2;
      result.push({ id: lineTiles[i].id, value: v });
      score += v;
      i += 2;
    } else {
      result.push(lineTiles[i]);
      i++;
    }
  }
  return { result, score };
}

function processMove(tiles: Tile[], direction: Direction, size: number) {
  const isH = direction === 'left' || direction === 'right';
  const isR = direction === 'right' || direction === 'down';
  const out: Tile[] = [];
  let totalScore = 0;
  let moved = false;

  for (let li = 0; li < size; li++) {
    const line = tiles
      .filter(t => (isH ? t.row : t.col) === li)
      .sort((a, b) => {
        const pa = isH ? a.col : a.row;
        const pb = isH ? b.col : b.row;
        return isR ? pb - pa : pa - pb;
      });

    const { result, score } = slideLine(
      line.map(t => ({ id: t.id, value: t.value })),
    );
    totalScore += score;

    for (let j = 0; j < result.length; j++) {
      const pos = isR ? size - 1 - j : j;
      const row = isH ? li : pos;
      const col = isH ? pos : li;
      const orig = tiles.find(t => t.id === result[j].id)!;
      if (
        orig.row !== row ||
        orig.col !== col ||
        result[j].value !== orig.value
      )
        moved = true;
      out.push({ id: result[j].id, value: result[j].value, row, col });
    }
  }
  return { tiles: out, score: totalScore, moved };
}

function verifyReplay(
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
    const r = processMove(tiles, dir, boardSize);
    if (!r.moved) continue;
    score += r.score;
    tiles = r.tiles;
    for (let i = 0; i < tilesPerMove; i++) {
      const t = addRandomTile(tiles, boardSize, random);
      if (!t) break;
      tiles = [...tiles, t];
    }
  }
  return score === claimedScore;
}

// ================================================================
// Lambda handler
// ================================================================

const VALID_DIRECTIONS = new Set(['up', 'down', 'left', 'right']);
const MAX_MOVES = 10000;
const RANKING_SIZE = 100;
const TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    if (event.httpMethod === 'POST') return handleSubmit(event);
    if (event.httpMethod === 'GET') return handleList(event);
    return badRequest('Unsupported method');
  } catch (err) {
    console.error(err);
    return serverError();
  }
}

async function handleSubmit(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body || '{}');
  const { score, timeLimit, boardSize, replay } = body;

  if (typeof score !== 'number' || score < 0)
    return badRequest('Invalid score');

  if (![30, 60, 90, 120, 0].includes(timeLimit))
    return badRequest('Invalid timeLimit');

  if (![3, 4, 5].includes(boardSize)) return badRequest('Invalid boardSize');

  if (
    !replay ||
    typeof replay.seed !== 'number' ||
    !Array.isArray(replay.moves)
  )
    return badRequest('Invalid replay data');

  if (replay.moves.length > MAX_MOVES)
    return badRequest('Too many moves');

  if (!replay.moves.every((m: unknown) => VALID_DIRECTIONS.has(m as string)))
    return badRequest('Invalid move in replay');

  const tilesPerMove = replay.tilesPerMove ?? 2;

  const verified = verifyReplay(
    replay.seed,
    boardSize,
    tilesPerMove,
    replay.moves,
    score,
  );

  if (!verified) return badRequest('Replay verification failed');

  const mode = `2048-${timeLimit}s-${boardSize}x${boardSize}`;

  // Check if score qualifies for top N
  const existing = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'by-mode-score',
      KeyConditionExpression: '#m = :mode',
      ExpressionAttributeNames: { '#m': 'mode' },
      ExpressionAttributeValues: { ':mode': mode },
      ScanIndexForward: false,
      Limit: RANKING_SIZE,
    }),
  );

  const entries = existing.Items || [];
  if (entries.length >= RANKING_SIZE) {
    const lowestScore = entries[entries.length - 1].score as number;
    if (score <= lowestScore) {
      return ok({ id: null, verified: true, ranked: false });
    }
    // Delete the lowest entry to make room
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE,
        Key: { id: entries[entries.length - 1].id },
      }),
    );
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + TTL_SECONDS;

  await docClient.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        id,
        mode,
        score,
        timeLimit,
        boardSize,
        playedAt: now,
        moveCount: replay.moves.length,
        ttl,
      },
    }),
  );

  return created({ id, verified: true, ranked: true });
}

async function handleList(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const mode =
    event.queryStringParameters?.mode || '2048-60s-4x4';
  const limitParam = event.queryStringParameters?.limit;
  const limit = Math.min(Number(limitParam) || 50, 100);

  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'by-mode-score',
      KeyConditionExpression: '#m = :mode',
      ExpressionAttributeNames: { '#m': 'mode' },
      ExpressionAttributeValues: { ':mode': mode },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );

  const items = (result.Items || []).map((item, i) => ({
    rank: i + 1,
    score: item.score,
    playedAt: item.playedAt,
    moveCount: item.moveCount,
  }));

  return ok(items);
}
