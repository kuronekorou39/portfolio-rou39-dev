import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  type Tile,
  type Direction,
  createPRNG,
  createInitialTiles,
  addRandomTile,
  processMove,
  canMove,
  getTileStyle,
  getTileFontSize,
} from '../lib/game2048';
import {
  submitGameScore,
  fetchGameRanking,
  type GameScoreEntry,
} from '../lib/api';

// ── Constants ──

const TIME_OPTIONS = [
  { label: '30s', value: 30 },
  { label: '60s', value: 60 },
  { label: '90s', value: 90 },
  { label: '120s', value: 120 },
  { label: '∞', value: 0 },
];

const BOARD_SIZE = 4;
const TILES_PER_MOVE = 2;
const MOVE_COOLDOWN_MS = 80;

type GamePhase = 'idle' | 'playing' | 'gameover';

// ── localStorage helpers ──

function getStoredBest(timeLimit: number): number {
  try {
    const v = localStorage.getItem(`game2048_best_${timeLimit}`);
    return v ? parseInt(v, 10) : 0;
  } catch {
    return 0;
  }
}

function saveStoredBest(timeLimit: number, score: number): void {
  try {
    localStorage.setItem(`game2048_best_${timeLimit}`, score.toString());
  } catch {
    /* noop */
  }
}

function getStoredName(): string {
  try {
    return localStorage.getItem('game2048_playerName') || '';
  } catch {
    return '';
  }
}

function saveStoredName(name: string): void {
  try {
    localStorage.setItem('game2048_playerName', name);
  } catch {
    /* noop */
  }
}

// ── Main Component ──

export default function Game2048Page() {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [score, setScore] = useState(0);
  const [timeLimit, setTimeLimit] = useState(60);
  const [timeLeftMs, setTimeLeftMs] = useState(60_000);
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [bestScore, setBestScore] = useState(() => getStoredBest(60));

  // Replay recording
  const seedRef = useRef(0);
  const randomRef = useRef<() => number>(Math.random);
  const movesRef = useRef<Direction[]>([]);

  // Ranking
  const [ranking, setRanking] = useState<GameScoreEntry[]>([]);
  const [playerName, setPlayerName] = useState(getStoredName);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isMovingRef = useRef(false);
  const gameStartTimeRef = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const tilesRef = useRef<Tile[]>([]);
  tilesRef.current = tiles;

  // ── Board sizing ──

  useEffect(() => {
    if (!boardRef.current) return;
    const el = boardRef.current;
    const observer = new ResizeObserver(entries => {
      setBoardWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const gap =
    boardWidth > 0 ? Math.max(6, Math.round(boardWidth * 0.022)) : 0;
  const cellSize =
    boardWidth > 0
      ? (boardWidth - (BOARD_SIZE + 1) * gap) / BOARD_SIZE
      : 0;

  // ── Best score per time limit ──

  useEffect(() => {
    setBestScore(getStoredBest(timeLimit));
  }, [timeLimit]);

  // ── Timer ──

  useEffect(() => {
    if (phase !== 'playing' || timeLimit === 0) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - gameStartTimeRef.current;
      const remaining = Math.max(0, timeLimit * 1000 - elapsed);
      setTimeLeftMs(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        setPhase('gameover');
      }
    }, 50);

    return () => clearInterval(interval);
  }, [phase, timeLimit]);

  // ── Save best on game over ──

  useEffect(() => {
    if (phase === 'gameover' && score > bestScore) {
      setBestScore(score);
      saveStoredBest(timeLimit, score);
    }
  }, [phase]);

  // ── Load ranking ──

  const currentMode = `2048-${timeLimit}s-${BOARD_SIZE}x${BOARD_SIZE}`;

  const loadRanking = useCallback(() => {
    fetchGameRanking(currentMode, 20)
      .then(setRanking)
      .catch(() => {});
  }, [currentMode]);

  useEffect(() => {
    loadRanking();
  }, [loadRanking]);

  // ── Actions ──

  const startGame = useCallback(() => {
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    seedRef.current = seed;
    const random = createPRNG(seed);
    randomRef.current = random;
    movesRef.current = [];

    const initial = createInitialTiles(BOARD_SIZE, random);
    setTiles(initial);
    setScore(0);
    setTimeLeftMs(timeLimit * 1000);
    setPhase('playing');
    setSubmitted(false);
    gameStartTimeRef.current = Date.now();
    isMovingRef.current = false;
  }, [timeLimit]);

  const handleMove = useCallback(
    (direction: Direction) => {
      if (phase !== 'playing' || isMovingRef.current) return;
      isMovingRef.current = true;

      const currentTiles = tilesRef.current;
      const result = processMove(currentTiles, direction, BOARD_SIZE);

      if (!result.moved) {
        isMovingRef.current = false;
        return;
      }

      movesRef.current.push(direction);
      if (result.score > 0) setScore(s => s + result.score);
      setTiles(result.tiles);

      setTimeout(() => {
        let current = tilesRef.current;
        const random = randomRef.current;
        for (let i = 0; i < TILES_PER_MOVE; i++) {
          const t = addRandomTile(current, BOARD_SIZE, random);
          if (!t) break;
          current = [...current, t];
        }
        setTiles(current);
        if (!canMove(current, BOARD_SIZE)) {
          setPhase('gameover');
        }
        isMovingRef.current = false;
      }, MOVE_COOLDOWN_MS);
    },
    [phase],
  );

  // ── Submit score ──

  const handleSubmit = async () => {
    const name = playerName.trim();
    if (!name || score === 0 || submitting) return;
    setSubmitting(true);
    saveStoredName(name);
    try {
      await submitGameScore({
        playerName: name,
        score,
        timeLimit,
        boardSize: BOARD_SIZE,
        replay: {
          seed: seedRef.current,
          tilesPerMove: TILES_PER_MOVE,
          moves: movesRef.current,
        },
      });
      setSubmitted(true);
      loadRanking();
    } catch (err) {
      console.error('Score submission failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Keyboard ──

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Direction> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      };
      const dir = map[e.key];
      if (dir) {
        e.preventDefault();
        handleMove(dir);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleMove]);

  // ── Touch / swipe ──

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartRef.current.x;
      const dy = t.clientY - touchStartRef.current.y;
      const threshold = 30;

      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
        handleMove(dx > 0 ? 'right' : 'left');
      } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > threshold) {
        handleMove(dy > 0 ? 'down' : 'up');
      }
      touchStartRef.current = null;
    },
    [handleMove],
  );

  // ── Timer display values ──

  const timerPercent =
    timeLimit > 0 ? (timeLeftMs / (timeLimit * 1000)) * 100 : 100;
  const timerColor =
    timerPercent > 50 ? '#34d399' : timerPercent > 25 ? '#fbbf24' : '#f87171';
  const timerText =
    timeLimit === 0
      ? '∞'
      : timeLeftMs <= 10_000
        ? `${(timeLeftMs / 1000).toFixed(1)}s`
        : `${Math.ceil(timeLeftMs / 1000)}s`;

  // ── Render ──

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-6 sm:py-10">
      <style>{`
        @keyframes tile-pop {
          0%   { transform: scale(0); }
          60%  { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
        .tile-pop-in {
          animation: tile-pop 0.12s ease-out 0.06s backwards;
        }
      `}</style>

      {/* Header */}
      <div className="mb-4 flex w-full items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            2048
          </h1>
          {timeLimit > 0 && (
            <p
              className="text-xs font-semibold tracking-widest"
              style={{ color: 'rgba(255,255,255,0.25)' }}
            >
              TIME ATTACK
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <ScoreCard label="SCORE" value={score} />
          <ScoreCard
            label="BEST"
            value={bestScore}
            highlight={phase === 'gameover' && score > 0 && score >= bestScore}
          />
        </div>
      </div>

      {/* Timer bar */}
      {timeLimit > 0 && phase !== 'idle' && (
        <div className="mb-4 w-full">
          <div className="mb-1 text-right">
            <span
              className="font-mono text-sm font-bold"
              style={{ color: timerColor }}
            >
              {timerText}
            </span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: timerColor }}
              animate={{
                width: `${timerPercent}%`,
                opacity:
                  timeLeftMs <= 5000 && phase === 'playing'
                    ? [1, 0.4, 1]
                    : 1,
              }}
              transition={{
                width: { duration: 0.1, ease: 'linear' },
                opacity: { duration: 0.5, repeat: Infinity },
              }}
            />
          </div>
        </div>
      )}

      {/* Game Board */}
      <div
        ref={boardRef}
        className="relative w-full select-none overflow-hidden rounded-xl"
        style={{
          aspectRatio: '1 / 1',
          backgroundColor: 'rgba(255,255,255,0.03)',
          touchAction: 'none',
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Background cells */}
        {boardWidth > 0 &&
          Array.from({ length: BOARD_SIZE * BOARD_SIZE }).map((_, i) => {
            const r = Math.floor(i / BOARD_SIZE);
            const c = i % BOARD_SIZE;
            return (
              <div
                key={i}
                className="absolute rounded-md"
                style={{
                  width: cellSize,
                  height: cellSize,
                  left: gap + c * (cellSize + gap),
                  top: gap + r * (cellSize + gap),
                  backgroundColor: 'rgba(255,255,255,0.04)',
                }}
              />
            );
          })}

        {/* Tiles */}
        {boardWidth > 0 &&
          [...tiles]
            .sort((a, b) => a.id - b.id)
            .map(tile => {
              const x = gap + tile.col * (cellSize + gap);
              const y = gap + tile.row * (cellSize + gap);
              const tileStyle = getTileStyle(tile.value);
              return (
                <div
                  key={tile.id}
                  className="absolute"
                  style={{
                    width: cellSize,
                    height: cellSize,
                    transform: `translate(${x}px, ${y}px)`,
                    transition:
                      'transform 0.12s cubic-bezier(0.33, 1, 0.68, 1)',
                  }}
                >
                  <div
                    key={`${tile.id}-${tile.value}`}
                    className="tile-pop-in flex h-full w-full items-center justify-center rounded-md font-bold select-none"
                    style={{
                      backgroundColor: tileStyle.bg,
                      color: tileStyle.text,
                      boxShadow: tileStyle.shadow,
                      fontSize: getTileFontSize(tile.value, cellSize),
                      lineHeight: 1,
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    {tile.value}
                  </div>
                </div>
              );
            })}

        {/* Idle overlay */}
        {phase === 'idle' && (
          <motion.div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-xl"
            style={{ backgroundColor: 'rgba(6,6,8,0.88)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <p
              className="text-sm"
              style={{ color: 'rgba(255,255,255,0.35)' }}
            >
              矢印キーまたはスワイプで操作
            </p>
            <button
              onClick={startGame}
              className="rounded-full bg-white px-8 py-3 text-sm font-bold text-black transition-transform hover:scale-105 active:scale-95"
            >
              START
            </button>
          </motion.div>
        )}

        {/* Game over overlay */}
        {phase === 'gameover' && (
          <motion.div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 rounded-xl"
            style={{ backgroundColor: 'rgba(6,6,8,0.88)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <p
              className="text-lg font-bold"
              style={{ color: 'rgba(255,255,255,0.45)' }}
            >
              {timeLimit > 0 ? 'TIME UP' : 'GAME OVER'}
            </p>
            <motion.p
              className="text-4xl font-black text-white"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 20,
                delay: 0.1,
              }}
            >
              {score.toLocaleString()}
            </motion.p>
            {score > 0 && score >= bestScore ? (
              <p
                className="mb-2 text-sm font-bold"
                style={{ color: '#ffd700' }}
              >
                NEW BEST!
              </p>
            ) : (
              <p
                className="mb-2 text-xs"
                style={{ color: 'rgba(255,255,255,0.25)' }}
              >
                BEST: {bestScore.toLocaleString()}
              </p>
            )}

            {/* Score submission */}
            {score > 0 && !submitted && (
              <div className="mb-3 flex w-56 gap-2">
                <input
                  type="text"
                  maxLength={20}
                  placeholder="名前"
                  value={playerName}
                  onChange={e => setPlayerName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/25"
                />
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !playerName.trim()}
                  className="rounded-lg bg-white/15 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-white/25 disabled:opacity-30"
                >
                  {submitting ? '...' : '登録'}
                </button>
              </div>
            )}
            {submitted && (
              <p
                className="mb-3 text-xs font-medium"
                style={{ color: '#34d399' }}
              >
                ランキングに登録しました
              </p>
            )}

            <button
              onClick={startGame}
              className="rounded-full bg-white px-8 py-3 text-sm font-bold text-black transition-transform hover:scale-105 active:scale-95"
            >
              もう一回
            </button>
          </motion.div>
        )}
      </div>

      {/* Time selector (visible when not playing) */}
      {phase !== 'playing' && (
        <motion.div
          className="mt-5 flex flex-wrap justify-center gap-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {TIME_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setTimeLimit(opt.value)}
              className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-all ${
                timeLimit === opt.value
                  ? 'border-white/20 bg-white/10 text-white'
                  : 'border-white/[0.06] text-white/30 hover:border-white/15 hover:text-white/50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </motion.div>
      )}

      {/* Hint text */}
      {phase === 'idle' && (
        <p
          className="mt-4 text-center text-xs"
          style={{ color: 'rgba(255,255,255,0.18)' }}
        >
          同じ数字をぶつけて2048を目指そう
        </p>
      )}

      {/* Ranking */}
      <Ranking ranking={ranking} currentMode={currentMode} />
    </div>
  );
}

// ── Sub-components ──

function ScoreCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className="min-w-[80px] rounded-lg border px-3 py-1.5 text-center"
      style={{
        borderColor: highlight
          ? 'rgba(255,215,0,0.3)'
          : 'rgba(255,255,255,0.06)',
        backgroundColor: highlight
          ? 'rgba(255,215,0,0.05)'
          : 'rgba(255,255,255,0.02)',
      }}
    >
      <p
        className="text-[10px] font-medium tracking-widest"
        style={{ color: 'rgba(255,255,255,0.3)' }}
      >
        {label}
      </p>
      <p className="text-base font-bold text-white tabular-nums">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function Ranking({
  ranking,
  currentMode,
}: {
  ranking: GameScoreEntry[];
  currentMode: string;
}) {
  if (ranking.length === 0) return null;

  const modeLabel = currentMode.replace('2048-', '').replace('-4x4', '');

  return (
    <div className="mt-8 w-full">
      <h2
        className="mb-3 text-sm font-bold tracking-wide"
        style={{ color: 'rgba(255,255,255,0.5)' }}
      >
        RANKING
        <span
          className="ml-2 text-xs font-normal"
          style={{ color: 'rgba(255,255,255,0.25)' }}
        >
          {modeLabel}
        </span>
      </h2>
      <div
        className="overflow-hidden rounded-lg border"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        {ranking.map((entry, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-3 py-2"
            style={{
              backgroundColor:
                i % 2 === 0
                  ? 'rgba(255,255,255,0.02)'
                  : 'rgba(255,255,255,0.01)',
              borderBottom:
                i < ranking.length - 1
                  ? '1px solid rgba(255,255,255,0.04)'
                  : 'none',
            }}
          >
            <span
              className="w-6 text-right text-xs font-bold tabular-nums"
              style={{
                color:
                  entry.rank === 1
                    ? '#ffd700'
                    : entry.rank === 2
                      ? '#c0c0c0'
                      : entry.rank === 3
                        ? '#cd7f32'
                        : 'rgba(255,255,255,0.25)',
              }}
            >
              {entry.rank}
            </span>
            <span
              className="flex-1 truncate text-sm text-white"
              style={{ color: 'rgba(255,255,255,0.8)' }}
            >
              {entry.playerName}
            </span>
            <span className="text-sm font-bold text-white tabular-nums">
              {entry.score.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
