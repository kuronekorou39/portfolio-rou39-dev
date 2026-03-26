import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  motion,
  useScroll,
  useTransform,
  useInView,
  useMotionValue,
  useSpring,
  AnimatePresence,
} from 'framer-motion';

// ─── Particle Background ───────────────────────────────────
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let animationId: number;
    let particles: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      opacity: number;
      hue: number;
    }[] = [];

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
    }

    function init() {
      resize();
      particles = Array.from({ length: 80 }, () => ({
        x: Math.random() * canvas!.width,
        y: Math.random() * canvas!.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 2 + 1,
        opacity: Math.random() * 0.5 + 0.1,
        hue: Math.random() * 60 + 220, // blue-purple range
      }));
    }

    function draw() {
      ctx.clearRect(0, 0, canvas!.width, canvas!.height);

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.beginPath();
            ctx.strokeStyle = `hsla(250, 80%, 70%, ${0.1 * (1 - dist / 150)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw particles
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas!.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas!.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, ${p.opacity})`;
        ctx.fill();
      }

      animationId = requestAnimationFrame(draw);
    }

    init();
    draw();
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-0"
    />
  );
}

// ─── Magnetic cursor effect ────────────────────────────────
function MagneticButton({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 20 });
  const springY = useSpring(y, { stiffness: 300, damping: 20 });

  function handleMouse(e: React.MouseEvent) {
    const rect = ref.current!.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    x.set((e.clientX - centerX) * 0.3);
    y.set((e.clientY - centerY) * 0.3);
  }

  function handleLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      ref={ref}
      style={{ x: springX, y: springY }}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Text reveal animation ─────────────────────────────────
function RevealText({ children, className, delay = 0 }: { children: string; className?: string; delay?: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <span ref={ref} className={`inline-block overflow-hidden ${className ?? ''}`}>
      <motion.span
        className="inline-block"
        initial={{ y: '120%', rotateX: 40 }}
        animate={isInView ? { y: 0, rotateX: 0 } : {}}
        transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.span>
    </span>
  );
}

// ─── Scroll-triggered section ──────────────────────────────
function FadeInSection({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 60 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Rotating tech stack ring ──────────────────────────────
const techItems = [
  'React', 'TypeScript', 'AWS', 'Lambda', 'DynamoDB',
  'CDK', 'Tailwind', 'Node.js', 'Vite', 'CloudFront',
  'Cognito', 'S3', 'Docker', 'Git',
];

function TechRing() {
  return (
    <div className="relative mx-auto h-[400px] w-[400px] md:h-[500px] md:w-[500px]">
      {/* Outer ring */}
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
      >
        {techItems.slice(0, 8).map((tech, i) => {
          const angle = (i / 8) * 360;
          const rad = (angle * Math.PI) / 180;
          const radius = 200;
          return (
            <motion.div
              key={tech}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-gray-200 bg-white/80 px-4 py-2 text-sm font-medium shadow-lg backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/80"
              style={{
                x: Math.cos(rad) * radius,
                y: Math.sin(rad) * radius,
              }}
              whileHover={{ scale: 1.2, zIndex: 10 }}
              animate={{ rotate: -360 }}
              transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
            >
              {tech}
            </motion.div>
          );
        })}
      </motion.div>

      {/* Inner ring */}
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: -360 }}
        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
      >
        {techItems.slice(8).map((tech, i) => {
          const angle = (i / 6) * 360;
          const rad = (angle * Math.PI) / 180;
          const radius = 110;
          return (
            <motion.div
              key={tech}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-200 bg-blue-50/80 px-3 py-1.5 text-xs font-medium text-blue-700 shadow-md backdrop-blur-sm dark:border-blue-800 dark:bg-blue-950/80 dark:text-blue-300"
              style={{
                x: Math.cos(rad) * radius,
                y: Math.sin(rad) * radius,
              }}
              whileHover={{ scale: 1.2, zIndex: 10 }}
              animate={{ rotate: 360 }}
              transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
            >
              {tech}
            </motion.div>
          );
        })}
      </motion.div>

      {/* Center */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <motion.div
          className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-2xl font-bold text-white shadow-2xl"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          R
        </motion.div>
      </div>
    </div>
  );
}

// ─── Number counter ────────────────────────────────────────
function Counter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    let current = 0;
    const step = target / 60;
    const interval = setInterval(() => {
      current += step;
      if (current >= target) {
        setCount(target);
        clearInterval(interval);
      } else {
        setCount(Math.floor(current));
      }
    }, 16);
    return () => clearInterval(interval);
  }, [isInView, target]);

  return (
    <span ref={ref}>
      {count}{suffix}
    </span>
  );
}

// ─── Showcase card with 3D tilt ────────────────────────────
function TiltCard({ title, subtitle, icon, index }: { title: string; subtitle: string; icon: string; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [8, -8]), { stiffness: 300, damping: 30 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-8, 8]), { stiffness: 300, damping: 30 });

  function handleMouse(e: React.MouseEvent) {
    const rect = ref.current!.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  }

  function handleLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      style={{ rotateX, rotateY, transformPerspective: 800 }}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: index * 0.15 }}
      className="group relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-2xl dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-blue-500/10 to-purple-500/10 blur-2xl transition-all group-hover:scale-150" />
      <div className="relative z-10">
        <span className="mb-4 block text-4xl">{icon}</span>
        <h3 className="mb-2 text-xl font-bold">{title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      </div>
    </motion.div>
  );
}

// ─── Horizontal scrolling text ─────────────────────────────
function MarqueeText() {
  const text = 'WEB APPS \u00B7 MOBILE APPS \u00B7 EXTENSIONS \u00B7 TOOLS \u00B7 ';

  return (
    <div className="overflow-hidden border-y border-gray-200 py-6 dark:border-gray-800">
      <motion.div
        className="flex whitespace-nowrap"
        animate={{ x: [0, -1920] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="mr-0 text-5xl font-black uppercase tracking-widest text-gray-100 dark:text-gray-800 md:text-7xl"
          >
            {text}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

// ─── Glowing orb background ────────────────────────────────
function GlowOrbs() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-blue-500/20 blur-[100px]"
        animate={{ x: [0, 100, 0], y: [0, -50, 0] }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-32 top-1/2 h-80 w-80 rounded-full bg-purple-500/20 blur-[100px]"
        animate={{ x: [0, -80, 0], y: [0, 60, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-1/4 left-1/3 h-64 w-64 rounded-full bg-cyan-500/15 blur-[80px]"
        animate={{ x: [0, 60, 0], y: [0, -80, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

// ─── Typing animation ──────────────────────────────────────
function TypingText() {
  const words = ['Web Apps', 'Mobile Apps', 'Extensions', 'Tools', 'Solutions'];
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % words.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={words[currentIndex]}
        initial={{ y: 30, opacity: 0, filter: 'blur(8px)' }}
        animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
        exit={{ y: -30, opacity: 0, filter: 'blur(8px)' }}
        transition={{ duration: 0.5 }}
        className="inline-block bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent"
      >
        {words[currentIndex]}
      </motion.span>
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════
export default function HomePage() {
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.8], [1, 0.9]);
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 150]);

  return (
    <div className="overflow-hidden">
      {/* ══════ HERO SECTION ══════ */}
      <section ref={heroRef} className="relative flex min-h-screen items-center justify-center">
        <ParticleField />
        <GlowOrbs />

        <motion.div
          style={{ opacity: heroOpacity, scale: heroScale, y: heroY }}
          className="relative z-10 px-6 text-center"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          >
            <RevealText className="text-6xl font-black tracking-tighter md:text-8xl lg:text-9xl">
              Creative
            </RevealText>
            <br />
            <RevealText className="text-6xl font-black tracking-tighter md:text-8xl lg:text-9xl" delay={0.15}>
              Developer
            </RevealText>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="mx-auto mt-8 max-w-xl text-lg text-gray-500 dark:text-gray-400 md:text-xl"
          >
            Building <TypingText /> with passion and precision.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.8 }}
            className="mt-12 flex flex-wrap items-center justify-center gap-4"
          >
            <MagneticButton>
              <Link
                to="/apps"
                className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-8 py-4 text-sm font-semibold text-white shadow-xl shadow-gray-900/20 transition-all hover:shadow-2xl hover:shadow-gray-900/30 dark:bg-white dark:text-gray-900 dark:shadow-white/10"
              >
                Explore Apps
                <motion.span
                  animate={{ x: [0, 4, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  &rarr;
                </motion.span>
              </Link>
            </MagneticButton>

            <MagneticButton>
              <a
                href="https://github.com/rou39"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-8 py-4 text-sm font-semibold transition-all hover:border-gray-900 hover:bg-gray-900 hover:text-white dark:border-gray-700 dark:hover:border-white dark:hover:bg-white dark:hover:text-gray-900"
              >
                GitHub
              </a>
            </MagneticButton>
          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="mt-20"
          >
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="mx-auto h-12 w-6 rounded-full border-2 border-gray-300 dark:border-gray-600"
            >
              <motion.div
                animate={{ y: [0, 16, 0], opacity: [1, 0.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="mx-auto mt-2 h-2 w-1 rounded-full bg-gray-400"
              />
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      {/* ══════ MARQUEE ══════ */}
      <MarqueeText />

      {/* ══════ ABOUT / STATS ══════ */}
      <section className="relative py-32">
        <div className="mx-auto max-w-6xl px-6">
          <FadeInSection>
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-blue-500">
              About
            </p>
            <h2 className="mb-16 max-w-3xl text-4xl font-bold tracking-tight md:text-5xl">
              フルスタック開発で、
              <br />
              アイデアを形にする。
            </h2>
          </FadeInSection>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              { number: 10, suffix: '+', label: 'Projects Built' },
              { number: 5, suffix: '+', label: 'Technologies' },
              { number: 3, suffix: '+', label: 'Platforms' },
            ].map((stat) => (
              <FadeInSection key={stat.label}>
                <motion.div
                  className="rounded-2xl border border-gray-200 p-8 text-center dark:border-gray-800"
                  whileHover={{ y: -4, boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
                >
                  <div className="mb-2 text-5xl font-black tracking-tight md:text-6xl">
                    <Counter target={stat.number} suffix={stat.suffix} />
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {stat.label}
                  </div>
                </motion.div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* ══════ TECH STACK ══════ */}
      <section className="relative py-32">
        <GlowOrbs />
        <div className="relative z-10 mx-auto max-w-6xl px-6">
          <FadeInSection className="text-center">
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-purple-500">
              Tech Stack
            </p>
            <h2 className="mb-16 text-4xl font-bold tracking-tight md:text-5xl">
              使用技術
            </h2>
          </FadeInSection>

          <FadeInSection>
            <TechRing />
          </FadeInSection>
        </div>
      </section>

      {/* ══════ SHOWCASE ══════ */}
      <section className="py-32">
        <div className="mx-auto max-w-6xl px-6">
          <FadeInSection>
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-pink-500">
              Showcase
            </p>
            <h2 className="mb-16 text-4xl font-bold tracking-tight md:text-5xl">
              つくったもの
            </h2>
          </FadeInSection>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              { title: 'U2B Loop', subtitle: 'YouTube動画の区間リピートツール', icon: '🔁' },
              { title: 'Koko-Meshi', subtitle: '近くの飯屋をサッと探す', icon: '🍜' },
              { title: 'Domain Traffic Inspector', subtitle: 'ドメインのトラフィックを可視化', icon: '🔍' },
              { title: 'Cryptid Assistant', subtitle: 'AI搭載のアシスタントツール', icon: '🤖' },
              { title: 'Memoria', subtitle: '思い出を記録・管理するアプリ', icon: '📸' },
              { title: 'More coming...', subtitle: '新しいプロダクトを開発中', icon: '🚀' },
            ].map((item, i) => (
              <TiltCard key={item.title} {...item} index={i} />
            ))}
          </div>

          <FadeInSection className="mt-16 text-center">
            <MagneticButton className="inline-block">
              <Link
                to="/apps"
                className="inline-flex items-center gap-2 rounded-full border-2 border-gray-900 px-10 py-4 text-sm font-bold transition-all hover:bg-gray-900 hover:text-white dark:border-white dark:hover:bg-white dark:hover:text-gray-900"
              >
                View All Apps
                <motion.span
                  animate={{ x: [0, 4, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  &rarr;
                </motion.span>
              </Link>
            </MagneticButton>
          </FadeInSection>
        </div>
      </section>

      {/* ══════ CTA ══════ */}
      <section className="relative overflow-hidden py-32">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-blue-950 to-purple-950 dark:from-gray-950 dark:via-blue-950 dark:to-purple-950" />
        <div className="absolute inset-0">
          <motion.div
            className="absolute left-1/4 top-1/4 h-64 w-64 rounded-full bg-blue-500/20 blur-[80px]"
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 8, repeat: Infinity }}
          />
          <motion.div
            className="absolute bottom-1/4 right-1/4 h-48 w-48 rounded-full bg-purple-500/20 blur-[60px]"
            animate={{ scale: [1.2, 1, 1.2] }}
            transition={{ duration: 6, repeat: Infinity }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-6 text-center text-white">
          <FadeInSection>
            <h2 className="mb-6 text-4xl font-bold tracking-tight md:text-6xl">
              Let's Build
              <br />
              Something Great.
            </h2>
            <p className="mb-10 text-lg text-gray-300">
              プロジェクトのご相談やフィードバックをお待ちしています。
            </p>
            <MagneticButton className="inline-block">
              <a
                href="https://github.com/rou39"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-white px-10 py-4 text-sm font-bold text-gray-900 shadow-2xl transition-transform hover:scale-105"
              >
                Get In Touch
              </a>
            </MagneticButton>
          </FadeInSection>
        </div>
      </section>
    </div>
  );
}
