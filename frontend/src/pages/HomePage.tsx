import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useScroll,
  useInView,
  AnimatePresence,
} from 'framer-motion';

// ─── Data ──────────────────────────────────────────────────
const projects = [
  { id: 'u2b-loop', title: 'U2B Loop', desc: 'YouTube区間リピート', emoji: '🔁', category: 'Web', color: '#FF6B6B', accent: '#FF3333' },
  { id: 'koko-meshi', title: 'Koko-Meshi', desc: '近くの飯屋を探す', emoji: '🍜', category: 'Mobile', color: '#FFB347', accent: '#FF8C00' },
  { id: 'domain-inspector', title: 'Domain Inspector', desc: 'トラフィック可視化', emoji: '🔍', category: 'Extension', color: '#7EC8E3', accent: '#2196F3' },
  { id: 'cryptid-assistant', title: 'Cryptid Assistant', desc: 'AI搭載アシスタント', emoji: '🤖', category: 'Web', color: '#C5B9FF', accent: '#7C4DFF' },
  { id: 'memoria', title: 'Memoria', desc: '思い出を記録・管理', emoji: '📸', category: 'Mobile', color: '#FFB7C5', accent: '#E91E63' },
  { id: 'mobile-omniverse', title: 'Mobile Omniverse', desc: 'モバイル統合プラットフォーム', emoji: '🌐', category: 'Mobile', color: '#A8E6CF', accent: '#00C853' },
  { id: 'mobile-bex', title: 'Mobile BEX', desc: 'モバイルブラウザ拡張', emoji: '🧩', category: 'Extension', color: '#FFE66D', accent: '#FFD600' },
];

// ─── Custom cursor with glow trail ─────────────────────────
function CustomCursor() {
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);
  const springX = useSpring(cursorX, { stiffness: 500, damping: 28 });
  const springY = useSpring(cursorY, { stiffness: 500, damping: 28 });

  // Trail (delayed)
  const trailX = useSpring(cursorX, { stiffness: 120, damping: 25 });
  const trailY = useSpring(cursorY, { stiffness: 120, damping: 25 });

  useEffect(() => {
    function move(e: MouseEvent) {
      cursorX.set(e.clientX);
      cursorY.set(e.clientY);
    }
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, []);

  return (
    <>
      {/* Glow trail */}
      <motion.div
        className="pointer-events-none fixed z-[9998] h-40 w-40 rounded-full mix-blend-screen"
        style={{
          x: trailX,
          y: trailY,
          translateX: '-50%',
          translateY: '-50%',
          background: 'radial-gradient(circle, rgba(120,100,255,0.15) 0%, transparent 70%)',
        }}
      />
      {/* Dot */}
      <motion.div
        className="pointer-events-none fixed z-[9999] h-3 w-3 rounded-full bg-white mix-blend-difference"
        style={{
          x: springX,
          y: springY,
          translateX: '-50%',
          translateY: '-50%',
        }}
      />
    </>
  );
}

// ─── Noise texture overlay ─────────────────────────────────
function NoiseOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width = 256;
    canvas.height = 256;
    const imageData = ctx.createImageData(256, 256);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const v = Math.random() * 255;
      imageData.data[i] = v;
      imageData.data[i + 1] = v;
      imageData.data[i + 2] = v;
      imageData.data[i + 3] = 15;
    }
    ctx.putImageData(imageData, 0, 0);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[100] h-full w-full opacity-40"
      style={{ imageRendering: 'pixelated', width: '100%', height: '100%' }}
    />
  );
}

// ─── Glitch text effect ────────────────────────────────────
function GlitchText({ children, className }: { children: string; className?: string }) {
  const [glitch, setGlitch] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 200);
    }, 4000 + Math.random() * 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className={`relative inline-block ${className ?? ''}`}>
      <span className="relative z-10">{children}</span>
      {glitch && (
        <>
          <span
            className="absolute left-0 top-0 z-20"
            style={{
              color: '#ff0040',
              clipPath: 'inset(10% 0 60% 0)',
              transform: 'translate(-3px, -1px)',
            }}
          >
            {children}
          </span>
          <span
            className="absolute left-0 top-0 z-20"
            style={{
              color: '#00f0ff',
              clipPath: 'inset(50% 0 10% 0)',
              transform: 'translate(3px, 1px)',
            }}
          >
            {children}
          </span>
        </>
      )}
    </span>
  );
}

// ─── Split text letter animation ───────────────────────────
function SplitText({
  children,
  className,
  delay = 0,
}: {
  children: string;
  className?: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  return (
    <span ref={ref} className={className}>
      {children.split('').map((char, i) => (
        <motion.span
          key={`${char}-${i}`}
          className="inline-block"
          initial={{ opacity: 0, y: 80, rotateX: 90 }}
          animate={isInView ? { opacity: 1, y: 0, rotateX: 0 } : {}}
          transition={{
            duration: 0.5,
            delay: delay + i * 0.04,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </motion.span>
      ))}
    </span>
  );
}

// ─── Horizontal scroll section ─────────────────────────────
function HorizontalScroll() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });
  const x = useTransform(scrollYProgress, [0, 1], ['0%', '-60%']);

  return (
    <section ref={containerRef} className="relative h-[300vh]">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <motion.div style={{ x }} className="flex gap-8 pl-[10vw]">
          {projects.map((project, i) => (
            <ProjectCard key={project.id} project={project} index={i} />
          ))}
          {/* End card */}
          <div className="flex h-[70vh] w-[40vw] min-w-[400px] shrink-0 items-center justify-center">
            <motion.div
              className="text-center"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              <p className="mb-4 text-7xl">→</p>
              <Link
                to="/apps"
                className="text-2xl font-bold text-white underline decoration-2 underline-offset-4 transition-colors hover:text-blue-400"
              >
                View All
              </Link>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Project card (for horizontal scroll) ──────────────────
function ProjectCard({
  project,
  index,
}: {
  project: (typeof projects)[0];
  index: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [12, -12]), {
    stiffness: 300,
    damping: 30,
  });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-12, 12]), {
    stiffness: 300,
    damping: 30,
  });

  function handleMouse(e: React.MouseEvent) {
    const rect = cardRef.current!.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  }

  function handleLeave() {
    mouseX.set(0);
    mouseY.set(0);
  }

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      style={{ rotateX, rotateY, transformPerspective: 1000 }}
      initial={{ opacity: 0, scale: 0.8 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: '-10%' }}
      transition={{ duration: 0.6, delay: index * 0.08 }}
      className="group relative h-[70vh] w-[40vw] min-w-[400px] shrink-0 cursor-pointer overflow-hidden rounded-3xl"
    >
      {/* Background */}
      <div
        className="absolute inset-0 opacity-20 transition-opacity duration-500 group-hover:opacity-40"
        style={{
          background: `radial-gradient(ellipse at 30% 20%, ${project.color}, transparent 60%), radial-gradient(ellipse at 70% 80%, ${project.accent}, transparent 60%)`,
        }}
      />
      <div className="absolute inset-0 border border-white/10 rounded-3xl" />

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col justify-between p-10">
        <div>
          <motion.span
            className="mb-2 inline-block rounded-full border border-white/20 px-3 py-1 text-xs font-medium uppercase tracking-widest text-white/60"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + index * 0.08 }}
          >
            {project.category}
          </motion.span>
        </div>

        <div>
          {/* Large emoji */}
          <motion.div
            className="mb-6 text-8xl"
            animate={{
              y: [0, -8, 0],
              rotate: [0, 3, -3, 0],
            }}
            transition={{
              duration: 4,
              delay: index * 0.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            {project.emoji}
          </motion.div>

          <h3 className="mb-2 text-4xl font-black text-white">{project.title}</h3>
          <p className="text-lg text-white/50">{project.desc}</p>

          {/* Hover reveal link */}
          <motion.div
            className="mt-6 overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            whileHover={{ height: 'auto', opacity: 1 }}
          >
            <Link
              to={`/apps/${project.id}`}
              className="inline-flex items-center gap-2 text-sm font-semibold transition-colors"
              style={{ color: project.color }}
            >
              詳細を見る →
            </Link>
          </motion.div>
        </div>
      </div>

      {/* Shine effect on hover */}
      <motion.div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.05) 45%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 55%, transparent 60%)`,
        }}
        animate={{ x: ['-100%', '100%'] }}
        transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
      />
    </motion.div>
  );
}

// ─── Morphing mesh gradient background ─────────────────────
function MeshGradient() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <motion.div
        className="absolute -left-1/4 -top-1/4 h-[60vh] w-[60vh] rounded-full blur-[120px]"
        style={{ background: 'rgba(100, 60, 255, 0.08)' }}
        animate={{
          x: [0, 200, 100, 0],
          y: [0, 100, 300, 0],
          scale: [1, 1.2, 0.9, 1],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-1/4 top-1/3 h-[50vh] w-[50vh] rounded-full blur-[120px]"
        style={{ background: 'rgba(255, 60, 100, 0.06)' }}
        animate={{
          x: [0, -150, -50, 0],
          y: [0, -100, 200, 0],
          scale: [1.1, 0.9, 1.2, 1.1],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-0 left-1/3 h-[40vh] w-[40vh] rounded-full blur-[100px]"
        style={{ background: 'rgba(60, 200, 255, 0.06)' }}
        animate={{
          x: [0, 100, -100, 0],
          y: [0, -200, -50, 0],
        }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

// ─── Stats bar ─────────────────────────────────────────────
function StatsBar() {
  const stats = [
    { label: 'PROJECTS', value: '10+' },
    { label: 'PLATFORMS', value: '3' },
    { label: 'TECH STACK', value: '12+' },
    { label: 'COMMITS', value: '∞' },
  ];

  return (
    <motion.div
      className="mx-auto flex max-w-4xl flex-wrap justify-center gap-12 px-6"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
    >
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.1 }}
        >
          <div className="text-4xl font-black text-white md:text-5xl">{stat.value}</div>
          <div className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-white/30">
            {stat.label}
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

// ─── Expanding project modal ───────────────────────────────
function ProjectModal({
  project,
  onClose,
}: {
  project: (typeof projects)[0];
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />

      {/* Content */}
      <motion.div
        className="relative z-10 mx-6 w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10"
        style={{
          background: `linear-gradient(135deg, ${project.color}15, ${project.accent}10, rgba(0,0,0,0.9))`,
        }}
        initial={{ scale: 0.8, y: 50, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.8, y: 50, opacity: 0 }}
        transition={{ type: 'spring', bounce: 0.2 }}
      >
        <div className="p-10">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <span className="mb-2 inline-block rounded-full border px-3 py-1 text-xs uppercase tracking-widest"
                style={{ borderColor: `${project.color}50`, color: project.color }}
              >
                {project.category}
              </span>
              <h2 className="mt-3 text-4xl font-black text-white">{project.title}</h2>
              <p className="mt-2 text-white/50">{project.desc}</p>
            </div>
            <motion.span
              className="text-6xl"
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              {project.emoji}
            </motion.span>
          </div>

          <div className="mt-8 flex gap-4">
            <Link
              to={`/apps/${project.id}`}
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white transition-transform hover:scale-105"
              style={{ background: project.accent }}
              onClick={onClose}
            >
              詳細ページへ →
            </Link>
            <button
              onClick={onClose}
              className="rounded-full border border-white/20 px-6 py-3 text-sm font-medium text-white/60 transition-colors hover:border-white/40 hover:text-white"
            >
              閉じる
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Interactive grid ──────────────────────────────────────
function InteractiveGrid() {
  const [selected, setSelected] = useState<(typeof projects)[0] | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useSpring(useTransform(mouseY, [0, 1], [3, -3]), { stiffness: 100, damping: 30 });
  const rotateY = useSpring(useTransform(mouseX, [0, 1], [-3, 3]), { stiffness: 100, damping: 30 });

  const handleMouse = useCallback((e: React.MouseEvent) => {
    mouseX.set(e.clientX / window.innerWidth);
    mouseY.set(e.clientY / window.innerHeight);
  }, []);

  const sizes = [
    'md:col-span-2 md:row-span-2',
    'md:col-span-1 md:row-span-1',
    'md:col-span-1 md:row-span-2',
    'md:col-span-1 md:row-span-1',
    'md:col-span-2 md:row-span-1',
    'md:col-span-1 md:row-span-1',
    'md:col-span-1 md:row-span-1',
  ];

  return (
    <>
      <motion.div
        ref={gridRef}
        onMouseMove={handleMouse}
        style={{ rotateX, rotateY, transformPerspective: 1500 }}
        className="mx-auto grid max-w-6xl auto-rows-[180px] grid-cols-2 gap-3 px-6 md:grid-cols-4 md:gap-4"
      >
        {projects.map((project, i) => (
          <motion.div
            key={project.id}
            className={`group relative cursor-pointer overflow-hidden rounded-2xl ${sizes[i]} border border-white/[0.06]`}
            style={{ background: 'rgba(255,255,255,0.02)' }}
            initial={{ opacity: 0, scale: 0.85 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{
              scale: 1.03,
              zIndex: 10,
              borderColor: `${project.color}40`,
              transition: { duration: 0.2 },
            }}
            onClick={() => setSelected(project)}
          >
            {/* Gradient bg */}
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              whileHover={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              style={{
                background: `radial-gradient(circle at 30% 70%, ${project.color}20, transparent 60%)`,
              }}
            />

            <div className="relative z-10 flex h-full flex-col justify-between p-5 md:p-6">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/25 transition-colors group-hover:text-white/50">
                  {project.category}
                </span>
                <motion.span
                  className="text-2xl md:text-3xl"
                  whileHover={{ scale: 1.4, rotate: 15 }}
                  transition={{ type: 'spring', bounce: 0.6 }}
                >
                  {project.emoji}
                </motion.span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white/80 transition-colors group-hover:text-white md:text-xl">
                  {project.title}
                </h3>
                <p className="mt-0.5 text-xs text-white/25 transition-colors group-hover:text-white/50 md:text-sm">
                  {project.desc}
                </p>
              </div>
            </div>

            {/* Edge glow */}
            <div
              className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              style={{
                boxShadow: `inset 0 0 40px ${project.color}10, 0 0 30px ${project.color}08`,
              }}
            />
          </motion.div>
        ))}
      </motion.div>

      <AnimatePresence>
        {selected && (
          <ProjectModal project={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Horizontal auto-scrolling tech tags ───────────────────
function TechMarquee() {
  const row1 = ['React', 'TypeScript', 'AWS Lambda', 'DynamoDB', 'Tailwind CSS', 'Node.js', 'Vite'];
  const row2 = ['CDK', 'CloudFront', 'S3', 'Cognito', 'API Gateway', 'Docker', 'Git'];

  function Row({ items, reverse = false }: { items: string[]; reverse?: boolean }) {
    const doubled = [...items, ...items, ...items];
    return (
      <div className="overflow-hidden">
        <motion.div
          className="flex gap-4 whitespace-nowrap"
          animate={{ x: reverse ? [0, 600] : [0, -600] }}
          transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
        >
          {doubled.map((item, i) => (
            <span
              key={`${item}-${i}`}
              className="inline-block rounded-full border border-white/10 px-5 py-2 text-sm font-medium text-white/30"
            >
              {item}
            </span>
          ))}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Row items={row1} />
      <Row items={row2} reverse />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════
export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-[#060608] text-white">
      <MeshGradient />
      <NoiseOverlay />
      <CustomCursor />

      {/* ══════ HERO ══════ */}
      <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="text-center"
        >
          {/* Overline */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-6 text-xs font-semibold uppercase tracking-[0.3em] text-white/30"
          >
            Portfolio / Showcase
          </motion.div>

          {/* Main title */}
          <h1 className="text-6xl font-black leading-[0.9] tracking-tighter md:text-8xl lg:text-[10rem]">
            <SplitText>rou39</SplitText>
          </h1>

          <div className="mt-6 text-xl text-white/40 md:text-2xl">
            <GlitchText>Full-Stack Developer</GlitchText>
          </div>

          {/* Animated tagline */}
          <motion.p
            className="mx-auto mt-8 max-w-md text-sm leading-relaxed text-white/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            Web &bull; Mobile &bull; Extensions &bull; Tools
          </motion.p>
        </motion.div>

        {/* Scroll arrow */}
        <motion.div
          className="absolute bottom-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
        >
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-sm font-medium tracking-widest text-white/20"
          >
            ↓ SCROLL
          </motion.div>
        </motion.div>
      </section>

      {/* ══════ STATS ══════ */}
      <section className="relative z-10 py-24">
        <StatsBar />
      </section>

      {/* ══════ HORIZONTAL SCROLL ══════ */}
      <section className="relative z-10">
        <div className="px-6 py-12">
          <motion.h2
            className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.3em] text-white/30"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            Featured Projects
          </motion.h2>
        </div>
        <HorizontalScroll />
      </section>

      {/* ══════ BENTO GRID ══════ */}
      <section className="relative z-10 py-32">
        <motion.div
          className="mb-16 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-white/30">
            All Projects
          </h2>
          <p className="mt-3 text-3xl font-bold text-white/80 md:text-4xl">
            一覧で見る
          </p>
        </motion.div>
        <InteractiveGrid />
      </section>

      {/* ══════ TECH MARQUEE ══════ */}
      <section className="relative z-10 py-20">
        <motion.div
          className="mb-12 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-white/30">
            Tech Stack
          </h2>
        </motion.div>
        <TechMarquee />
      </section>

      {/* ══════ CTA ══════ */}
      <section className="relative z-10 py-32">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-5xl font-black tracking-tight md:text-7xl">
              <SplitText>Let's talk.</SplitText>
            </h2>
            <p className="mt-6 text-white/30">
              プロジェクトの相談、フィードバック、なんでも。
            </p>
            <motion.div className="mt-10">
              <Link
                to="/apps"
                className="group inline-flex items-center gap-4 rounded-full border border-white/20 px-10 py-5 text-sm font-semibold text-white transition-all hover:border-white/60 hover:bg-white hover:text-black"
              >
                Explore All Apps
                <motion.span
                  className="inline-block"
                  animate={{ x: [0, 4, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  →
                </motion.span>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
