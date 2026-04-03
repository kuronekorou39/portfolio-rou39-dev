import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import thumbnail from '@/assets/april-fools-thumbnail.png';
import { fetchPageView } from '@/lib/api';

// Pink-themed confetti for pig theme
function Confetti() {
  const [particles] = useState(() =>
    Array.from({ length: 80 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 2 + Math.random() * 3,
      size: 4 + Math.random() * 8,
      color: ['#ff6bb5', '#ffb3d9', '#ff85a1', '#c084fc', '#f9a8d4', '#fda4af', '#fb7185'][
        Math.floor(Math.random() * 7)
      ],
      rotation: Math.random() * 360,
      drift: (Math.random() - 0.5) * 60,
    }))
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ y: -20, x: `${p.x}vw`, opacity: 1, rotate: 0 }}
          animate={{
            y: '110vh',
            x: `calc(${p.x}vw + ${p.drift}px)`,
            opacity: [1, 1, 0],
            rotate: p.rotation + 720,
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: 'linear',
          }}
          style={{
            position: 'absolute',
            width: p.size,
            height: p.size * 0.6,
            backgroundColor: p.color,
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );
}

// Glitch text effect
function GlitchText({ children }: { children: string }) {
  return (
    <div className="relative inline-block">
      <span className="relative z-10">{children}</span>
      <motion.span
        className="absolute left-0 top-0 z-0 text-red-500"
        animate={{
          x: [0, -3, 3, -1, 0],
          opacity: [0, 1, 1, 1, 0],
        }}
        transition={{
          duration: 0.3,
          repeat: Infinity,
          repeatDelay: 1.5,
        }}
        aria-hidden
      >
        {children}
      </motion.span>
      <motion.span
        className="absolute left-0 top-0 z-0 text-cyan-400"
        animate={{
          x: [0, 3, -3, 1, 0],
          opacity: [0, 1, 1, 1, 0],
        }}
        transition={{
          duration: 0.3,
          repeat: Infinity,
          repeatDelay: 1.5,
          delay: 0.05,
        }}
        aria-hidden
      >
        {children}
      </motion.span>
    </div>
  );
}

type Phase = 'idle' | 'loading' | 'glitch' | 'reveal';

export default function AprilFoolsPage() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [bufferPercent, setBufferPercent] = useState(0);
  const [glitchIntensity, setGlitchIntensity] = useState(0);
  const [glitchTick, setGlitchTick] = useState(0);
  const [victimCount, setVictimCount] = useState<number | null>(null);

  // Fetch final victim count (no longer incrementing)
  useEffect(() => {
    if (phase !== 'loading' || victimCount !== null) return;
    fetchPageView('april-fools')
      .then((data) => setVictimCount(data.count))
      .catch(() => setVictimCount(309));
  }, [phase, victimCount]);

  // Tab title sync
  useEffect(() => {
    if (phase === 'idle') document.title = '動画を再生';
    else if (phase === 'loading') document.title = '読み込み中...';
    else if (phase === 'glitch') document.title = '⚠ エラー';
    else document.title = '🐷 April Fools!';
  }, [phase]);

  const reset = useCallback(() => {
    setPhase('idle');
    setBufferPercent(0);
    setGlitchIntensity(0);
    setGlitchTick(0);
  }, []);

  const startGlitch = useCallback(() => {
    setPhase('glitch');

    // Vibrate on mobile during glitch
    if (navigator.vibrate) {
      navigator.vibrate([50, 30, 80, 30, 50, 30, 100, 50, 150, 50, 200]);
    }

    let intensity = 0;
    const glitchInterval = setInterval(() => {
      intensity += 0.12;
      setGlitchIntensity(Math.min(intensity, 1));
      setGlitchTick((t) => t + 1);
      if (intensity >= 1) {
        clearInterval(glitchInterval);
        setTimeout(() => setPhase('reveal'), 400);
      }
    }, 80);
  }, []);

  // Loading phase: fake buffer progress
  useEffect(() => {
    if (phase !== 'loading') return;

    const interval = setInterval(() => {
      setBufferPercent((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(startGlitch, 300);
          return 100;
        }
        const increment = prev > 80 ? 1 + Math.random() * 2 : 3 + Math.random() * 8;
        return Math.min(prev + increment, 100);
      });
    }, 150);

    return () => clearInterval(interval);
  }, [phase, startGlitch]);

  // Glitch phase: screen shake via CSS animation
  useEffect(() => {
    if (phase !== 'glitch') return;
    const interval = setInterval(() => setGlitchTick((t) => t + 1), 50);
    return () => clearInterval(interval);
  }, [phase]);

  // Generate random glitch values per tick
  const shakeX = phase === 'glitch' ? (Math.random() - 0.5) * glitchIntensity * 40 : 0;
  const shakeY = phase === 'glitch' ? (Math.random() - 0.5) * glitchIntensity * 20 : 0;
  const skew = phase === 'glitch' ? (Math.random() - 0.5) * glitchIntensity * 15 : 0;

  // Suppress unused var warning
  void glitchTick;

  const glitchStyle =
    phase === 'glitch'
      ? {
          filter: `
            hue-rotate(${glitchIntensity * 180}deg)
            saturate(${1 + glitchIntensity * 3})
            brightness(${1 + glitchIntensity * 0.5})
          `,
          transform: `
            translate(${shakeX}px, ${shakeY}px)
            skewX(${skew}deg)
            scale(${1 + glitchIntensity * 0.05})
          `,
        }
      : {};

  return (
    <div className="fixed inset-0 z-[9999] bg-black">
      <AnimatePresence mode="wait">
        {phase !== 'reveal' ? (
          // ===== Video Player Phase =====
          <motion.div
            key="player"
            className="relative flex h-full w-full items-center justify-center"
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.3 }}
          >
            {/* Thumbnail with glitch effects */}
            <div className="relative h-full w-full" style={glitchStyle}>
              <img
                src={thumbnail}
                alt=""
                className="h-full w-full object-cover"
              />

              {/* Dark overlay */}
              <div className="absolute inset-0 bg-black/40" />

              {/* Scanline overlay during glitch */}
              {phase === 'glitch' && (
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: `repeating-linear-gradient(
                      0deg,
                      transparent,
                      transparent 2px,
                      rgba(0,0,0,${0.1 + glitchIntensity * 0.3}) 2px,
                      rgba(0,0,0,${0.1 + glitchIntensity * 0.3}) 4px
                    )`,
                  }}
                />
              )}

              {/* RGB split blocks during glitch */}
              {phase === 'glitch' &&
                Array.from({ length: Math.floor(glitchIntensity * 10) }, (_, i) => (
                  <div
                    key={i}
                    className="pointer-events-none absolute"
                    style={{
                      top: `${Math.random() * 100}%`,
                      left: 0,
                      right: 0,
                      height: `${2 + Math.random() * 40}px`,
                      background: `rgba(${Math.random() > 0.5 ? '255,0,0' : '0,255,255'}, ${0.15 + glitchIntensity * 0.25})`,
                      transform: `translateX(${(Math.random() - 0.5) * glitchIntensity * 150}px)`,
                    }}
                  />
                ))}
            </div>

            {/* Top gradient bar */}
            {(phase === 'idle' || phase === 'loading') && (
              <div className="absolute left-0 right-0 top-0 bg-gradient-to-b from-black/80 to-transparent px-4 pb-12 pt-4">
                <div className="mx-auto max-w-3xl">
                  <span className="text-sm text-white/70">修正なしフルバージョン.mp4</span>
                </div>
              </div>
            )}

            {/* Idle: Play button overlay */}
            {phase === 'idle' && (
              <button
                className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center"
                onClick={() => setPhase('loading')}
              >
                <motion.div
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm sm:h-20 sm:w-20"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <svg
                    width="28"
                    height="32"
                    viewBox="0 0 28 32"
                    fill="white"
                    className="ml-1"
                  >
                    <path d="M0 0 L28 16 L0 32 Z" />
                  </svg>
                </motion.div>
              </button>
            )}

            {/* Loading: Buffering UI */}
            {phase === 'loading' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <motion.div
                  className="mb-6"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                    <circle
                      cx="24"
                      cy="24"
                      r="20"
                      stroke="white"
                      strokeOpacity="0.2"
                      strokeWidth="3"
                    />
                    <path
                      d="M44 24c0-11.046-8.954-20-20-20"
                      stroke="white"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </motion.div>

                <p className="text-sm text-white/70">
                  読み込み中... {Math.floor(bufferPercent)}%
                </p>

                <div className="mt-4 h-1 w-48 overflow-hidden rounded-full bg-white/10 sm:w-64">
                  <motion.div
                    className="h-full rounded-full bg-white/80"
                    style={{ width: `${bufferPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Fake player bottom bar */}
            {(phase === 'idle' || phase === 'loading') && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-12">
                <div className="mx-auto flex max-w-3xl items-center gap-3">
                  <div className="text-white/60">
                    {phase === 'idle' ? (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M3 1 L15 8 L3 15 Z" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <rect x="1" y="1" width="5" height="14" rx="1" />
                        <rect x="10" y="1" width="5" height="14" rx="1" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="h-1 rounded-full bg-white/20">
                      <div className="h-full w-0 rounded-full bg-red-500" />
                    </div>
                  </div>
                  <span className="text-xs text-white/50">0:00 / 3:24</span>
                </div>
              </div>
            )}

            {/* Glitch phase: error text flickers */}
            {phase === 'glitch' && glitchIntensity > 0.5 && (
              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0, 1, 0, 1] }}
                transition={{ duration: 0.6 }}
              >
                <p className="font-mono text-lg text-red-500 sm:text-2xl">
                  ERROR: 0x04010001
                </p>
              </motion.div>
            )}
          </motion.div>
        ) : (
          // ===== Reveal Phase =====
          <motion.div
            key="reveal"
            className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <Confetti />

            {/* Background glow - pink themed */}
            <div className="absolute inset-0">
              <motion.div
                className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, rgba(251,113,133,0.15) 0%, rgba(244,114,182,0.1) 40%, transparent 70%)',
                }}
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 4, repeat: Infinity }}
              />
            </div>

            {/* Pig emoji with puru-puru shake */}
            <motion.div
              className="relative mb-2 text-6xl sm:text-8xl"
              initial={{ scale: 0, rotate: -180 }}
              animate={{
                scale: 1,
                rotate: [0, -5, 5, -3, 3, 0],
              }}
              transition={{
                scale: { type: 'spring', damping: 10, stiffness: 100, delay: 0.2 },
                rotate: {
                  delay: 1.8,
                  duration: 0.4,
                  repeat: Infinity,
                  repeatDelay: 2.5,
                },
              }}
            >
              🐷
            </motion.div>

            {/* Main text */}
            <motion.div
              className="relative mb-3 text-center"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.6 }}
            >
              <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl md:text-7xl">
                <GlitchText>April Fools!</GlitchText>
              </h1>
            </motion.div>

            {/* Buhi message */}
            <motion.div
              className="relative mb-8 text-center"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.5 }}
            >
              <p className="text-2xl font-bold text-white/90 sm:text-3xl">
                ぶひ
                <motion.span
                  animate={{ opacity: [0, 1] }}
                  transition={{ delay: 1.0, duration: 0.1 }}
                >
                  ！
                </motion.span>
                <motion.span
                  animate={{ opacity: [0, 1] }}
                  transition={{ delay: 1.15, duration: 0.1 }}
                >
                  ！
                </motion.span>
                <motion.span
                  animate={{ opacity: [0, 1] }}
                  transition={{ delay: 1.3, duration: 0.1 }}
                >
                  ！
                </motion.span>
                <motion.span
                  animate={{ opacity: [0, 1] }}
                  transition={{ delay: 1.45, duration: 0.1 }}
                >
                  ！
                </motion.span>
              </p>
              <motion.p
                className="mt-2 text-lg"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.6, type: 'spring', damping: 8 }}
              >
                🐖🐖💦💦
              </motion.p>
            </motion.div>

            {/* Victim counter */}
            <motion.div
              className="relative mb-6 rounded-xl border border-white/10 bg-white/5 px-6 py-3 backdrop-blur-sm"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 1.1, type: 'spring', damping: 15 }}
            >
              <p className="text-center text-sm text-white/50">
                <span className="text-lg font-bold text-pink-400">
                  {victimCount ?? '...'}
                </span>
                人が騙されました
              </p>
            </motion.div>

            {/* Replay button */}
            <motion.button
              className="relative mb-6 cursor-pointer rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm text-white/60 backdrop-blur-sm transition-colors hover:bg-white/10 hover:text-white/90"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 2.0 }}
              onClick={reset}
            >
              🔄 もう一回騙される
            </motion.button>

            {/* April 1 badge */}
            <motion.p
              className="relative text-xs text-white/30"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
            >
              2026.4.1 April Fools Event — 終了しました
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
