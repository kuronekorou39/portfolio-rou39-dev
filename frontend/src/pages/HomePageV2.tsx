import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  motion,
  useScroll,
  useTransform,
  useInView,
  AnimatePresence,
  useMotionValue,
  useSpring,
} from 'framer-motion';

// ─── Color palette ─────────────────────────────────────────
const palette = {
  pink: '#FFB7C5',
  lavender: '#C5B9FF',
  mint: '#A8E6CF',
  peach: '#FFD3B6',
  sky: '#B5DEFF',
  cream: '#FFF5E4',
  yellow: '#FFE66D',
};

// ─── Kawaii floating shapes ────────────────────────────────
function FloatingShapes() {
  const shapes = [
    { emoji: '☁️', size: 'text-6xl', x: '10%', y: '15%', duration: 6, delay: 0 },
    { emoji: '⭐', size: 'text-4xl', x: '80%', y: '10%', duration: 5, delay: 1 },
    { emoji: '🌸', size: 'text-5xl', x: '70%', y: '70%', duration: 7, delay: 0.5 },
    { emoji: '☁️', size: 'text-7xl', x: '85%', y: '40%', duration: 8, delay: 2 },
    { emoji: '✨', size: 'text-3xl', x: '20%', y: '60%', duration: 4, delay: 1.5 },
    { emoji: '🌙', size: 'text-4xl', x: '50%', y: '80%', duration: 6.5, delay: 0.8 },
    { emoji: '💫', size: 'text-3xl', x: '35%', y: '20%', duration: 5.5, delay: 2.2 },
    { emoji: '☁️', size: 'text-5xl', x: '5%', y: '75%', duration: 7.5, delay: 1.2 },
    { emoji: '🫧', size: 'text-4xl', x: '60%', y: '25%', duration: 5, delay: 0.3 },
    { emoji: '🪄', size: 'text-3xl', x: '45%', y: '55%', duration: 6, delay: 1.8 },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {shapes.map((s, i) => (
        <motion.div
          key={i}
          className={`absolute ${s.size} select-none opacity-40`}
          style={{ left: s.x, top: s.y }}
          animate={{
            y: [0, -20, 0, 15, 0],
            x: [0, 10, 0, -8, 0],
            rotate: [0, 5, -5, 3, 0],
          }}
          transition={{
            duration: s.duration,
            delay: s.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          {s.emoji}
        </motion.div>
      ))}
    </div>
  );
}

// ─── Bouncing blob background ──────────────────────────────
function PastelBlobs() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -left-20 top-10 h-72 w-72 rounded-full opacity-40 blur-[80px]"
        style={{ background: palette.pink }}
        animate={{ x: [0, 40, 0], y: [0, 30, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute right-10 top-1/3 h-64 w-64 rounded-full opacity-40 blur-[80px]"
        style={{ background: palette.lavender }}
        animate={{ x: [0, -30, 0], y: [0, -40, 0], scale: [1.1, 1, 1.1] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-20 left-1/3 h-56 w-56 rounded-full opacity-40 blur-[70px]"
        style={{ background: palette.mint }}
        animate={{ x: [0, 20, 0], y: [0, -20, 0], scale: [1, 1.2, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-10 bottom-1/4 h-48 w-48 rounded-full opacity-30 blur-[60px]"
        style={{ background: palette.peach }}
        animate={{ x: [0, -20, 0], y: [0, 25, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

// ─── Kawaii face that follows cursor ───────────────────────
function KawaiiMascot() {
  const containerRef = useRef<HTMLDivElement>(null);
  const eyeLeftX = useMotionValue(0);
  const eyeLeftY = useMotionValue(0);
  const eyeRightX = useMotionValue(0);
  const eyeRightY = useMotionValue(0);
  const smoothLeftX = useSpring(eyeLeftX, { stiffness: 200, damping: 30 });
  const smoothLeftY = useSpring(eyeLeftY, { stiffness: 200, damping: 30 });
  const smoothRightX = useSpring(eyeRightX, { stiffness: 200, damping: 30 });
  const smoothRightY = useSpring(eyeRightY, { stiffness: 200, damping: 30 });
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    function handleMouse(e: MouseEvent) {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / window.innerWidth;
      const dy = (e.clientY - cy) / window.innerHeight;
      const maxMove = 6;
      eyeLeftX.set(dx * maxMove);
      eyeLeftY.set(dy * maxMove);
      eyeRightX.set(dx * maxMove);
      eyeRightY.set(dy * maxMove);
    }
    window.addEventListener('mousemove', handleMouse);
    return () => window.removeEventListener('mousemove', handleMouse);
  }, []);

  // Random blinking
  useEffect(() => {
    const interval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 150);
    }, 3000 + Math.random() * 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      ref={containerRef}
      className="relative"
      animate={{ y: [0, -10, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
    >
      {/* Body */}
      <motion.div
        className="relative mx-auto flex h-40 w-40 items-center justify-center rounded-full shadow-xl md:h-52 md:w-52"
        style={{ background: `linear-gradient(135deg, ${palette.pink}, ${palette.lavender})` }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        {/* Cheeks */}
        <div
          className="absolute bottom-10 left-6 h-6 w-8 rounded-full opacity-50 md:bottom-12 md:left-8 md:h-8 md:w-10"
          style={{ background: palette.peach }}
        />
        <div
          className="absolute bottom-10 right-6 h-6 w-8 rounded-full opacity-50 md:bottom-12 md:right-8 md:h-8 md:w-10"
          style={{ background: palette.peach }}
        />

        {/* Eyes */}
        <div className="flex gap-8 md:gap-10">
          {/* Left eye */}
          <div className="relative flex h-8 w-8 items-center justify-center md:h-10 md:w-10">
            {blink ? (
              <div className="h-1 w-6 rounded-full bg-gray-800 md:w-8" />
            ) : (
              <motion.div
                className="h-6 w-6 rounded-full bg-gray-800 md:h-7 md:w-7"
                style={{ x: smoothLeftX, y: smoothLeftY }}
              >
                <div className="absolute left-1 top-1 h-2 w-2 rounded-full bg-white md:h-2.5 md:w-2.5" />
              </motion.div>
            )}
          </div>

          {/* Right eye */}
          <div className="relative flex h-8 w-8 items-center justify-center md:h-10 md:w-10">
            {blink ? (
              <div className="h-1 w-6 rounded-full bg-gray-800 md:w-8" />
            ) : (
              <motion.div
                className="h-6 w-6 rounded-full bg-gray-800 md:h-7 md:w-7"
                style={{ x: smoothRightX, y: smoothRightY }}
              >
                <div className="absolute left-1 top-1 h-2 w-2 rounded-full bg-white md:h-2.5 md:w-2.5" />
              </motion.div>
            )}
          </div>
        </div>

        {/* Mouth */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 md:bottom-10">
          <motion.div
            className="h-3 w-6 overflow-hidden md:h-4 md:w-8"
            animate={{ scaleY: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <div className="h-6 w-6 rounded-full border-2 border-t-0 border-gray-800 md:h-8 md:w-8" />
          </motion.div>
        </div>

        {/* Sparkle accessory */}
        <motion.div
          className="absolute -right-2 -top-2 text-2xl"
          animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          ✨
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// ─── Wobbly section reveal ─────────────────────────────────
function WobbleIn({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{
        duration: 0.7,
        delay,
        type: 'spring',
        bounce: 0.4,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Bouncy pill tag ───────────────────────────────────────
function BouncyTag({ label, color, delay }: { label: string; color: string; delay: number }) {
  return (
    <motion.span
      className="inline-block cursor-default rounded-full px-4 py-2 text-sm font-semibold text-gray-700 shadow-md"
      style={{ background: color }}
      initial={{ opacity: 0, scale: 0 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ delay, type: 'spring', bounce: 0.6 }}
      whileHover={{
        scale: 1.15,
        rotate: [0, -5, 5, 0],
        transition: { duration: 0.3 },
      }}
      whileTap={{ scale: 0.9 }}
    >
      {label}
    </motion.span>
  );
}

// ─── Jelly card ────────────────────────────────────────────
function JellyCard({
  title,
  subtitle,
  emoji,
  color,
  index,
}: {
  title: string;
  subtitle: string;
  emoji: string;
  color: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.8 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true }}
      transition={{
        delay: index * 0.12,
        type: 'spring',
        bounce: 0.45,
      }}
      whileHover={{
        y: -8,
        scale: 1.03,
        transition: { type: 'spring', bounce: 0.5 },
      }}
      whileTap={{ scale: 0.97 }}
      className="group cursor-pointer overflow-hidden rounded-3xl border-2 border-white/60 p-6 shadow-lg backdrop-blur-sm"
      style={{ background: `${color}40` }}
    >
      <motion.div
        className="mb-4 inline-block text-5xl"
        animate={{ rotate: [0, -10, 10, -5, 0] }}
        transition={{ duration: 3, delay: index * 0.5, repeat: Infinity, repeatDelay: 2 }}
      >
        {emoji}
      </motion.div>
      <h3 className="mb-1 text-lg font-bold text-gray-800">{title}</h3>
      <p className="text-sm text-gray-500">{subtitle}</p>

      <motion.div
        className="mt-4 inline-flex items-center gap-1 text-sm font-semibold"
        style={{ color: color }}
        initial={{ x: 0 }}
        whileHover={{ x: 4 }}
      >
        見てみる
        <motion.span
          animate={{ x: [0, 3, 0] }}
          transition={{ duration: 1, repeat: Infinity }}
        >
          →
        </motion.span>
      </motion.div>
    </motion.div>
  );
}

// ─── Wave SVG divider ──────────────────────────────────────
function WaveDivider({ color, flip = false }: { color: string; flip?: boolean }) {
  return (
    <div className={`w-full overflow-hidden leading-[0] ${flip ? 'rotate-180' : ''}`}>
      <svg
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
        className="relative block h-16 w-full md:h-24"
      >
        <motion.path
          d="M0,40 C360,100 720,0 1080,60 C1260,90 1380,30 1440,50 L1440,120 L0,120 Z"
          fill={color}
          animate={{
            d: [
              'M0,40 C360,100 720,0 1080,60 C1260,90 1380,30 1440,50 L1440,120 L0,120 Z',
              'M0,60 C360,20 720,90 1080,30 C1260,10 1380,70 1440,40 L1440,120 L0,120 Z',
              'M0,40 C360,100 720,0 1080,60 C1260,90 1380,30 1440,50 L1440,120 L0,120 Z',
            ],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
      </svg>
    </div>
  );
}

// ─── Floating bubbles ──────────────────────────────────────
function Bubbles() {
  const bubbles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    size: Math.random() * 30 + 10,
    left: Math.random() * 100,
    duration: Math.random() * 8 + 6,
    delay: Math.random() * 5,
    color: [palette.pink, palette.lavender, palette.mint, palette.sky, palette.peach][
      Math.floor(Math.random() * 5)
    ],
  }));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {bubbles.map((b) => (
        <motion.div
          key={b.id}
          className="absolute rounded-full"
          style={{
            width: b.size,
            height: b.size,
            left: `${b.left}%`,
            bottom: -b.size,
            background: `radial-gradient(circle at 30% 30%, white, ${b.color})`,
            opacity: 0.5,
          }}
          animate={{
            y: [0, -(window.innerHeight + b.size * 2)],
            x: [0, Math.sin(b.id) * 40, 0],
          }}
          transition={{
            duration: b.duration,
            delay: b.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}
    </div>
  );
}

// ─── Handwritten-style underline ───────────────────────────
function Underline({ color }: { color: string }) {
  return (
    <motion.svg
      viewBox="0 0 200 12"
      className="absolute -bottom-2 left-0 w-full"
      initial={{ pathLength: 0, opacity: 0 }}
      whileInView={{ pathLength: 1, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, delay: 0.3 }}
    >
      <motion.path
        d="M5,8 Q50,2 100,7 T195,6"
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.3 }}
      />
    </motion.svg>
  );
}

// ─── Rotating emoji circle ─────────────────────────────────
function EmojiOrbit() {
  const emojis = ['💻', '📱', '🧩', '🛠️', '🎨', '🚀'];

  return (
    <div className="relative mx-auto h-48 w-48 md:h-64 md:w-64">
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
      >
        {emojis.map((emoji, i) => {
          const angle = (i / emojis.length) * 360;
          const rad = (angle * Math.PI) / 180;
          const radius = 90;
          return (
            <motion.div
              key={emoji}
              className="absolute left-1/2 top-1/2 text-3xl md:text-4xl"
              style={{
                x: Math.cos(rad) * radius - 16,
                y: Math.sin(rad) * radius - 16,
              }}
              animate={{ rotate: -360 }}
              transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            >
              {emoji}
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

// ─── Typing + deleting text ────────────────────────────────
function CuteTyping() {
  const phrases = ['つくるのが好き', 'コードが好き', 'ものづくりが好き'];
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [text, setText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const phrase = phrases[phraseIndex];
    const timeout = setTimeout(
      () => {
        if (!isDeleting) {
          setText(phrase.slice(0, text.length + 1));
          if (text.length + 1 === phrase.length) {
            setTimeout(() => setIsDeleting(true), 1500);
          }
        } else {
          setText(phrase.slice(0, text.length - 1));
          if (text.length === 0) {
            setIsDeleting(false);
            setPhraseIndex((prev) => (prev + 1) % phrases.length);
          }
        }
      },
      isDeleting ? 60 : 120,
    );
    return () => clearTimeout(timeout);
  }, [text, isDeleting, phraseIndex]);

  return (
    <span className="inline-block">
      {text}
      <motion.span
        className="inline-block w-0.5 bg-gray-600"
        style={{ height: '1.1em', verticalAlign: 'text-bottom' }}
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.6, repeat: Infinity }}
      />
    </span>
  );
}

// ─── Confetti burst on click ───────────────────────────────
function ConfettiButton({ children, className }: { children: React.ReactNode; className?: string }) {
  const [particles, setParticles] = useState<
    { id: number; x: number; y: number; color: string; angle: number }[]
  >([]);

  function handleClick(e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const colors = [palette.pink, palette.lavender, palette.mint, palette.yellow, palette.peach];
    const newParticles = Array.from({ length: 12 }, (_, i) => ({
      id: Date.now() + i,
      x: cx,
      y: cy,
      color: colors[i % colors.length],
      angle: (i / 12) * 360,
    }));
    setParticles((prev) => [...prev, ...newParticles]);
    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => !newParticles.includes(p)));
    }, 800);
  }

  return (
    <div className={`relative inline-block ${className ?? ''}`} onClick={handleClick}>
      {children}
      <AnimatePresence>
        {particles.map((p) => (
          <motion.div
            key={p.id}
            className="pointer-events-none absolute h-2 w-2 rounded-full"
            style={{ background: p.color, left: p.x, top: p.y }}
            initial={{ scale: 1, opacity: 1 }}
            animate={{
              x: Math.cos((p.angle * Math.PI) / 180) * 80,
              y: Math.sin((p.angle * Math.PI) / 180) * 80 - 20,
              scale: 0,
              opacity: 0,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN PAGE — ゆるかわ version
// ═══════════════════════════════════════════════════════════
export default function HomePage() {
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.7], [1, 0.95]);

  return (
    <div className="overflow-hidden bg-gradient-to-b from-[#FFF5EE] via-white to-[#F0F0FF]">
      {/* ══════ HERO ══════ */}
      <section ref={heroRef} className="relative min-h-screen">
        <PastelBlobs />
        <FloatingShapes />

        <motion.div
          style={{ opacity: heroOpacity, scale: heroScale }}
          className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center"
        >
          {/* Mascot */}
          <motion.div
            initial={{ opacity: 0, y: -30, scale: 0.5 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', bounce: 0.5, duration: 1 }}
          >
            <KawaiiMascot />
          </motion.div>

          {/* Title */}
          <motion.h1
            className="mt-8 text-5xl font-black tracking-tight text-gray-800 md:text-7xl"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, type: 'spring', bounce: 0.4 }}
          >
            <span className="relative inline-block">
              ようこそ
              <Underline color={palette.pink} />
            </span>
            {'  '}
            <motion.span
              className="inline-block"
              animate={{ rotate: [0, 15, -15, 10, 0] }}
              transition={{ delay: 1, duration: 0.5, repeat: Infinity, repeatDelay: 4 }}
            >
              👋
            </motion.span>
          </motion.h1>

          <motion.p
            className="mt-6 text-xl text-gray-500 md:text-2xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, type: 'spring', bounce: 0.3 }}
          >
            <CuteTyping />
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, type: 'spring', bounce: 0.3 }}
          >
            <ConfettiButton>
              <Link
                to="/apps"
                className="inline-flex items-center gap-2 rounded-full px-8 py-4 text-sm font-bold text-white shadow-lg transition-transform hover:scale-105"
                style={{ background: `linear-gradient(135deg, ${palette.pink}, ${palette.lavender})` }}
              >
                アプリを見る ✨
              </Link>
            </ConfettiButton>

            <motion.a
              href="https://github.com/rou39"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border-2 px-8 py-4 text-sm font-bold text-gray-600 transition-all hover:bg-gray-800 hover:text-white"
              style={{ borderColor: palette.lavender }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              GitHub 🐙
            </motion.a>
          </motion.div>

          {/* Scroll hint */}
          <motion.div
            className="mt-16"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
          >
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-3xl"
            >
              🐾
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      {/* ══════ WAVE DIVIDER ══════ */}
      <WaveDivider color="#FFF0F5" />

      {/* ══════ ABOUT ══════ */}
      <section className="relative bg-[#FFF0F5] py-24">
        <Bubbles />
        <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
          <WobbleIn>
            <p
              className="mb-3 text-sm font-bold uppercase tracking-widest"
              style={{ color: palette.pink }}
            >
              About Me ☁️
            </p>
            <h2 className="mb-8 text-4xl font-black text-gray-800 md:text-5xl">
              <span className="relative inline-block">
                ものづくりする人
                <Underline color={palette.lavender} />
              </span>
            </h2>
          </WobbleIn>

          <WobbleIn delay={0.15}>
            <p className="mx-auto max-w-xl text-lg leading-relaxed text-gray-600">
              Webアプリ、モバイルアプリ、ブラウザ拡張機能まで。
              <br />
              「あったらいいな」を形にするのが好きです。
            </p>
          </WobbleIn>

          <WobbleIn delay={0.3}>
            <div className="mt-12">
              <EmojiOrbit />
            </div>
          </WobbleIn>
        </div>
      </section>

      <WaveDivider color="#FFF0F5" flip />

      {/* ══════ TECH STACK ══════ */}
      <section className="py-24">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <WobbleIn>
            <p
              className="mb-3 text-sm font-bold uppercase tracking-widest"
              style={{ color: palette.lavender }}
            >
              Tech Stack 🧰
            </p>
            <h2 className="mb-12 text-4xl font-black text-gray-800 md:text-5xl">
              すきな技術
            </h2>
          </WobbleIn>

          <div className="flex flex-wrap justify-center gap-3">
            {[
              { label: 'React ⚛️', color: palette.sky },
              { label: 'TypeScript 💙', color: palette.lavender },
              { label: 'AWS ☁️', color: palette.peach },
              { label: 'Lambda ⚡', color: palette.yellow },
              { label: 'DynamoDB 🗃️', color: palette.mint },
              { label: 'Tailwind 🎨', color: palette.pink },
              { label: 'Node.js 💚', color: palette.mint },
              { label: 'Vite ⚡', color: palette.lavender },
              { label: 'Docker 🐳', color: palette.sky },
              { label: 'Git 🌿', color: palette.peach },
              { label: 'CDK 🏗️', color: palette.yellow },
              { label: 'S3 📦', color: palette.pink },
            ].map((tag, i) => (
              <BouncyTag key={tag.label} {...tag} delay={i * 0.06} />
            ))}
          </div>
        </div>
      </section>

      {/* ══════ WAVE DIVIDER ══════ */}
      <WaveDivider color="#F5F0FF" />

      {/* ══════ SHOWCASE ══════ */}
      <section className="relative bg-[#F5F0FF] py-24">
        <FloatingShapes />
        <div className="relative z-10 mx-auto max-w-5xl px-6">
          <WobbleIn className="text-center">
            <p
              className="mb-3 text-sm font-bold uppercase tracking-widest"
              style={{ color: palette.mint.replace('A8', '60') }}
            >
              Showcase 🎪
            </p>
            <h2 className="mb-16 text-4xl font-black text-gray-800 md:text-5xl">
              <span className="relative inline-block">
                つくったもの
                <Underline color={palette.mint} />
              </span>
            </h2>
          </WobbleIn>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: 'U2B Loop', subtitle: 'YouTube区間リピート', emoji: '🔁', color: '#FF6B6B' },
              { title: 'Koko-Meshi', subtitle: '近くの飯屋を探す', emoji: '🍜', color: '#FFB347' },
              { title: 'Domain Inspector', subtitle: 'トラフィック可視化', emoji: '🔍', color: '#7EC8E3' },
              { title: 'Cryptid Assistant', subtitle: 'AIアシスタント', emoji: '🤖', color: '#C5B9FF' },
              { title: 'Memoria', subtitle: '思い出管理アプリ', emoji: '📸', color: '#FFB7C5' },
              { title: 'Coming Soon...', subtitle: 'まだまだ作るよ', emoji: '🌱', color: '#A8E6CF' },
            ].map((item, i) => (
              <JellyCard key={item.title} {...item} index={i} />
            ))}
          </div>

          <WobbleIn className="mt-14 text-center" delay={0.3}>
            <ConfettiButton>
              <Link
                to="/apps"
                className="inline-flex items-center gap-2 rounded-full border-2 px-10 py-4 text-sm font-bold text-gray-700 transition-all hover:text-white"
                style={{
                  borderColor: palette.lavender,
                  background: 'transparent',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = palette.lavender;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                もっと見る →
              </Link>
            </ConfettiButton>
          </WobbleIn>
        </div>
      </section>

      <WaveDivider color="#F5F0FF" flip />

      {/* ══════ CTA ══════ */}
      <section className="relative py-32">
        <PastelBlobs />
        <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
          <WobbleIn>
            <motion.div
              className="mx-auto mb-6 text-6xl"
              animate={{ y: [0, -10, 0], rotate: [0, 5, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              💌
            </motion.div>
            <h2 className="mb-4 text-4xl font-black text-gray-800 md:text-5xl">
              きがるに
              <span className="relative inline-block">
                はなそう
                <Underline color={palette.peach} />
              </span>
            </h2>
            <p className="mb-10 text-lg text-gray-500">
              お仕事の相談やフィードバック、雑談でもなんでも。
            </p>
          </WobbleIn>

          <WobbleIn delay={0.2}>
            <ConfettiButton>
              <motion.a
                href="https://github.com/rou39"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full px-10 py-4 text-sm font-bold text-white shadow-xl"
                style={{ background: `linear-gradient(135deg, ${palette.peach}, ${palette.pink})` }}
                whileHover={{ scale: 1.05, boxShadow: '0 20px 40px rgba(255,183,197,0.4)' }}
                whileTap={{ scale: 0.95 }}
              >
                おはなしする 💬
              </motion.a>
            </ConfettiButton>
          </WobbleIn>
        </div>
      </section>
    </div>
  );
}
