import { useCallback, useEffect, useRef, useState } from 'react';
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
import avatarImg from '@/assets/avatar.png';
import underConstructionImg from '@/assets/under-construction.png';
import { fetchContributions, type ContributionCalendar } from '@/lib/api';

// ─── Data ──────────────────────────────────────────────────
const projects = [
  { id: 'local-port-board', title: 'Local PortBoard', desc: 'ローカル開発環境のポート監視・管理ツール', emoji: '🖥️', category: 'Desktop', color: '#7EC8E3', accent: '#2196F3' },
];

// ═══════════════════════════════════════════════════════════
// INTERACTIVE BACKGROUND TOYS
// ═══════════════════════════════════════════════════════════

// ─── Cursor glow (flashlight-like, but subtle) ─────────────
function CursorGlow() {
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);
  const springX = useSpring(cursorX, { stiffness: 500, damping: 28 });
  const springY = useSpring(cursorY, { stiffness: 500, damping: 28 });
  const trailX = useSpring(cursorX, { stiffness: 120, damping: 25 });
  const trailY = useSpring(cursorY, { stiffness: 120, damping: 25 });
  const glowX = useSpring(cursorX, { stiffness: 60, damping: 20 });
  const glowY = useSpring(cursorY, { stiffness: 60, damping: 20 });
  const [lightsOn, setLightsOn] = useState(false);

  useEffect(() => {
    function move(e: MouseEvent) {
      cursorX.set(e.clientX);
      cursorY.set(e.clientY);
    }
    const observer = new MutationObserver(() => {
      setLightsOn(document.body.classList.contains('lights-on'));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('mousemove', move);
    return () => {
      window.removeEventListener('mousemove', move);
      observer.disconnect();
    };
  }, []);

  return (
    <>
      {/* Ambient glow — hidden when lights on */}
      {!lightsOn && (
        <motion.div
          className="pointer-events-none fixed z-[5] rounded-full mix-blend-screen"
          style={{
            x: glowX,
            y: glowY,
            translateX: '-50%',
            translateY: '-50%',
            width: 350,
            height: 350,
            background: 'radial-gradient(circle, rgba(120,100,255,0.10) 0%, rgba(80,60,200,0.05) 40%, transparent 70%)',
            willChange: 'transform',
          }}
        />
      )}
      {/* Trail — hidden when lights on */}
      {!lightsOn && (
        <motion.div
          className="pointer-events-none fixed z-[150] h-40 w-40 rounded-full mix-blend-screen"
          style={{
            x: trailX,
            y: trailY,
            translateX: '-50%',
            translateY: '-50%',
            background: 'radial-gradient(circle, rgba(120,100,255,0.15) 0%, transparent 70%)',
            willChange: 'transform',
          }}
        />
      )}
      {/* Dot — always visible, changes style for light mode */}
      <motion.div
        className={`pointer-events-none fixed z-[151] rounded-full ${lightsOn ? 'h-4 w-4 bg-black/20' : 'h-3 w-3 bg-white mix-blend-difference'}`}
        style={{
          x: springX,
          y: springY,
          translateX: '-50%',
          translateY: '-50%',
          willChange: 'transform',
        }}
      />
    </>
  );
}

// ─── Glowing eyes hidden in the dark background ────────────
interface EyePair {
  id: number;
  x: number;
  y: number;
  vx: number; // autonomous velocity
  vy: number;
  size: number;
  blinkSpeed: number;
  color: string;
  wanderTimer: number; // time until next direction change
  wanderSpeed: number;
}

const MAX_EYES = 5;
const SPAWN_INTERVAL = 4000; // ms between new eye spawns
const EYE_COLORS = ['#FFD700', '#FF6B6B', '#7EC8E3', '#A8E6CF', '#C5B9FF'];

function spawnEyeOffscreen(id: number): EyePair {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const side = Math.floor(Math.random() * 4);
  let x: number, y: number;
  switch (side) {
    case 0: x = Math.random() * w; y = -20; break;
    case 1: x = w + 20; y = Math.random() * h; break;
    case 2: x = Math.random() * w; y = h + 20; break;
    default: x = -20; y = Math.random() * h; break;
  }
  const cx = w / 2 + (Math.random() - 0.5) * w * 0.6;
  const cy = h / 2 + (Math.random() - 0.5) * h * 0.6;
  const angle = Math.atan2(cy - y, cx - x);
  // Individual speed personality: some fast, some slow
  const speed = 0.8 + Math.random() * 1.5;

  return {
    id,
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    size: Math.random() * 2.5 + 2,
    blinkSpeed: 2 + Math.random() * 3,
    color: EYE_COLORS[id % EYE_COLORS.length],
    wanderTimer: 60 + Math.random() * 120,
    wanderSpeed: speed,
  };
}

function GlowingEyes() {
  const [eyeIds, setEyeIds] = useState<number[]>([]);
  const eyesRef = useRef<EyePair[]>([]);
  const eyeElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const cursorRef = useRef({ x: -999, y: -999 });
  const nextIdRef = useRef(0);
  const frameRef = useRef<number>(0);
  const targetsRef = useRef<Map<number, { angle: number; speed: number }>>(new Map());

  // Ref callback for eye DOM elements
  const setEyeElement = useCallback((id: number, el: HTMLDivElement | null) => {
    if (el) {
      eyeElementsRef.current.set(id, el);
    } else {
      eyeElementsRef.current.delete(id);
    }
  }, []);

  // Track cursor
  useEffect(() => {
    function handleMouse(e: MouseEvent) {
      cursorRef.current = { x: e.clientX, y: e.clientY };
    }
    window.addEventListener('mousemove', handleMouse);
    return () => window.removeEventListener('mousemove', handleMouse);
  }, []);

  // Gradually spawn eyes from offscreen
  useEffect(() => {
    const firstTimer = setTimeout(() => {
      const eye = spawnEyeOffscreen(nextIdRef.current++);
      eyesRef.current = [eye];
      setEyeIds([eye.id]);
    }, 2000);

    const interval = setInterval(() => {
      if (eyesRef.current.length >= MAX_EYES) return;
      const eye = spawnEyeOffscreen(nextIdRef.current++);
      eyesRef.current = [...eyesRef.current, eye];
      setEyeIds(eyesRef.current.map(e => e.id));
    }, SPAWN_INTERVAL);

    return () => { clearTimeout(firstTimer); clearInterval(interval); };
  }, []);

  // Animation loop: update ref data + DOM directly, no React re-renders
  useEffect(() => {
    function tick() {
      const cursor = cursorRef.current;
      const w = window.innerWidth;
      const h = window.innerHeight;
      let needsReactUpdate = false;

      eyesRef.current = eyesRef.current
        .map((eye) => {
          let { x, y, vx, vy, wanderTimer, wanderSpeed } = eye;

          if (!targetsRef.current.has(eye.id)) {
            targetsRef.current.set(eye.id, {
              angle: Math.atan2(vy, vx),
              speed: wanderSpeed,
            });
          }
          const target = targetsRef.current.get(eye.id)!;

          wanderTimer -= 1;
          if (wanderTimer <= 0) {
            const cx = w / 2;
            const cy = h / 2;
            const fromCenterX = Math.abs(x - cx) / cx;
            const fromCenterY = Math.abs(y - cy) / cy;
            const fromCenter = Math.max(fromCenterX, fromCenterY);

            let newAngle: number;
            if (fromCenter < 0.3 && Math.random() < 0.6) {
              const outwardAngle = Math.atan2(y - cy, x - cx);
              newAngle = outwardAngle + (Math.random() - 0.5) * Math.PI * 0.8;
            } else {
              newAngle = Math.random() * Math.PI * 2;
            }

            target.angle = newAngle;
            target.speed = 0.5 + Math.random() * 1.2;
            wanderTimer = 100 + Math.random() * 250;
            targetsRef.current.set(eye.id, target);
          }

          const currentAngle = Math.atan2(vy, vx);
          let angleDiff = target.angle - currentAngle;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          const steerAngle = currentAngle + angleDiff * 0.03;

          const currentSpeed = Math.sqrt(vx * vx + vy * vy);
          const targetSpeed = target.speed;
          const newSpeed = currentSpeed + (targetSpeed - currentSpeed) * 0.02;

          vx = Math.cos(steerAngle) * newSpeed;
          vy = Math.sin(steerAngle) * newSpeed;

          const dx = x - cursor.x;
          const dy = y - cursor.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 180 && dist > 0) {
            const fleeAngle = Math.atan2(dy, dx);
            const fleeStrength = 0.8 + (eye.id % 5) * 0.3;
            const force = ((180 - dist) / 180) * fleeStrength;
            vx += Math.cos(fleeAngle) * force;
            vy += Math.sin(fleeAngle) * force;
          }

          x += vx;
          y += vy;

          // Mutate in-place (no object spread needed for ref data)
          eye.x = x;
          eye.y = y;
          eye.vx = vx;
          eye.vy = vy;
          eye.wanderTimer = wanderTimer;
          eye.wanderSpeed = target.speed;

          // Update DOM directly — transform on parent, blink animation on child (no conflict)
          const el = eyeElementsRef.current.get(eye.id);
          if (el) {
            el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
            const cdx = x - cursor.x;
            const cdy = y - cursor.y;
            const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
            const nearCursor = cdist < 250;
            const opacity = nearCursor ? Math.max(0.1, cdist / 400) : 0.7;
            el.style.opacity = String(opacity);
          }

          return eye;
        })
        .filter((eye) => {
          const margin = 80;
          const gone = eye.x < -margin || eye.x > w + margin || eye.y < -margin || eye.y > h + margin;
          if (gone) {
            targetsRef.current.delete(eye.id);
            needsReactUpdate = true;
          }
          return !gone;
        });

      // Only trigger React re-render when eyes are removed
      if (needsReactUpdate) {
        setEyeIds(eyesRef.current.map(e => e.id));
      }

      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  return (
    <div className="glowing-eyes-container pointer-events-none fixed inset-0 z-[2] transition-opacity duration-500">
      <style>{`
        @keyframes eye-blink {
          0%, 45%, 55%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(0.1); }
        }
        body.lights-on .glowing-eyes-container { opacity: 0 !important; }
      `}</style>
      {eyeIds.map((id) => {
        const eye = eyesRef.current.find(e => e.id === id);
        if (!eye) return null;

        return (
          <div
            key={id}
            ref={(el) => setEyeElement(id, el)}
            className="absolute left-0 top-0"
            style={{
              transform: `translate3d(${eye.x}px, ${eye.y}px, 0)`,
              opacity: 0.7,
              transition: 'opacity 0.5s',
              willChange: 'transform, opacity',
            }}
          >
            <div
              className="flex gap-[5px]"
              style={{
                animation: `eye-blink ${eye.blinkSpeed}s ease-in-out infinite`,
              }}
            >
              <div
                className="rounded-full"
                style={{
                  width: eye.size,
                  height: eye.size,
                  background: eye.color,
                  boxShadow: `0 0 ${eye.size * 3}px ${eye.color}80`,
                }}
              />
              <div
                className="rounded-full"
                style={{
                  width: eye.size,
                  height: eye.size,
                  background: eye.color,
                  boxShadow: `0 0 ${eye.size * 3}px ${eye.color}80`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Hidden messages that appear when cursor is near ───────
// ─── Hidden light switch — flip to illuminate the entire page ─
function HiddenSwitch() {
  const [cursorPos, setCursorPos] = useState({ x: -999, y: -999 });
  const [found, setFound] = useState(false);
  const [lightsOn, setLightsOn] = useState(false);
  const switchX = 50;
  const switchY = 800;

  // Clean up filter on unmount (page navigation)
  useEffect(() => {
    return () => {
      document.documentElement.style.filter = '';
      document.documentElement.style.transition = '';
      document.body.classList.remove('lights-on');
    };
  }, []);

  useEffect(() => {
    function handleMouse(e: MouseEvent) {
      setCursorPos({ x: e.clientX, y: e.clientY + window.scrollY });
    }
    window.addEventListener('mousemove', handleMouse);
    return () => window.removeEventListener('mousemove', handleMouse);
  }, []);

  const dx = switchX - cursorPos.x;
  const dy = switchY - cursorPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const visible = dist < 150;
  const opacity = visible ? Math.max(0, 1 - dist / 150) : 0;

  if (!found && visible && dist < 80) {
    setTimeout(() => setFound(true), 0);
  }

  return (
    <>
      <motion.div
        className="absolute z-[120] cursor-pointer"
        style={{ left: switchX - 16, top: switchY - 24 }}
        animate={{ opacity: found ? 0.8 : opacity }}
        transition={{ duration: 0.3 }}
        onClick={() => {
          setLightsOn((prev) => {
            const next = !prev;
            document.documentElement.style.transition = 'filter 0.6s ease';
            document.documentElement.style.filter = next ? 'invert(1) hue-rotate(180deg)' : '';
            document.body.classList.toggle('lights-on', next);
            if (next) {
              setTimeout(() => {
                setLightsOn(false);
                document.documentElement.style.transition = 'filter 1s ease';
                document.documentElement.style.filter = '';
                document.body.classList.remove('lights-on');
              }, 10000);
            }
            return next;
          });
        }}
      >
        <motion.div
          className="flex h-[48px] w-[32px] items-center justify-center rounded-md border border-white/20 bg-white/5"
          whileHover={{
            borderColor: 'rgba(255,200,50,0.5)',
            boxShadow: '0 0 20px rgba(255,200,50,0.2)',
          }}
        >
          <motion.div
            className="h-[18px] w-[10px] rounded-sm"
            animate={lightsOn
              ? { y: -4, background: 'rgba(255,220,100,0.9)' }
              : { y: 3, background: 'rgba(255,255,255,0.3)' }
            }
            transition={{ type: 'spring', stiffness: 400 }}
          />
        </motion.div>
        {found && !lightsOn && (
          <motion.div
            className="mt-1 text-center text-[9px] text-white/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            click?
          </motion.div>
        )}
      </motion.div>

      {/* Lights on — handled via document.documentElement.style.filter */}
    </>
  );
}

// ─── Click ripple effect ───────────────────────────────────
function ClickRipples() {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      setRipples((prev) => [...prev, { id: Date.now(), x: e.clientX, y: e.clientY }]);
    }
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[6]">
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.div
            key={r.id}
            className="absolute rounded-full border border-white/20"
            style={{ left: r.x, top: r.y, translateX: '-50%', translateY: '-50%' }}
            initial={{ width: 0, height: 0, opacity: 0.5 }}
            animate={{ width: 150, height: 150, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            onAnimationComplete={() =>
              setRipples((prev) => prev.filter((p) => p.id !== r.id))
            }
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PORTFOLIO COMPONENTS
// ═══════════════════════════════════════════════════════════

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
      imageData.data[i + 3] = 12;
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

// ─── Glitch text ───────────────────────────────────────────
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
          <span className="absolute left-0 top-0 z-20" style={{ color: '#ff0040', clipPath: 'inset(10% 0 60% 0)', transform: 'translate(-3px, -1px)' }}>{children}</span>
          <span className="absolute left-0 top-0 z-20" style={{ color: '#00f0ff', clipPath: 'inset(50% 0 10% 0)', transform: 'translate(3px, 1px)' }}>{children}</span>
        </>
      )}
    </span>
  );
}

// ─── Split text ────────────────────────────────────────────
function SplitText({ children, className, delay = 0 }: { children: string; className?: string; delay?: number }) {
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
          transition={{ duration: 0.5, delay: delay + i * 0.04, ease: [0.22, 1, 0.36, 1] }}
        >
          {char === ' ' ? '\u00A0' : char}
        </motion.span>
      ))}
    </span>
  );
}

// ─── Mesh gradient background ──────────────────────────────
function MeshGradient() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <motion.div
        className="absolute -left-1/4 -top-1/4 h-[60vh] w-[60vh] rounded-full blur-[80px]"
        style={{ background: 'rgba(100, 60, 255, 0.08)', willChange: 'transform' }}
        animate={{ x: [0, 200, 100, 0], y: [0, 100, 300, 0], scale: [1, 1.2, 0.9, 1] }}
        transition={{ duration: 40, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-1/4 top-1/3 h-[50vh] w-[50vh] rounded-full blur-[80px]"
        style={{ background: 'rgba(255, 60, 100, 0.06)', willChange: 'transform' }}
        animate={{ x: [0, -150, -50, 0], y: [0, -100, 200, 0], scale: [1.1, 0.9, 1.2, 1.1] }}
        transition={{ duration: 35, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-0 left-1/3 h-[40vh] w-[40vh] rounded-full blur-[80px]"
        style={{ background: 'rgba(60, 200, 255, 0.06)', willChange: 'transform' }}
        animate={{ x: [0, 100, -100, 0], y: [0, -200, -50, 0] }}
        transition={{ duration: 38, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

// ─── Stats bar ─────────────────────────────────────────────
// ─── Hidden avatar — revealed by cursor proximity ─────────
function HiddenAvatar() {
  const imgRef = useRef<HTMLDivElement>(null);
  const [mask, setMask] = useState('radial-gradient(circle 0px at -999px -999px, white, transparent)');
  const [lightsOn, setLightsOn] = useState(false);

  useEffect(() => {
    function handleMouse(e: MouseEvent) {
      if (!imgRef.current) return;
      const rect = imgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setMask(`radial-gradient(circle 120px at ${x}px ${y}px, white 0%, transparent 100%)`);
    }
    const observer = new MutationObserver(() => {
      setLightsOn(document.body.classList.contains('lights-on'));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('mousemove', handleMouse);
    return () => {
      window.removeEventListener('mousemove', handleMouse);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={imgRef}
      className="pointer-events-none absolute -left-44 top-1/2 hidden -translate-y-1/2 md:block lg:-left-56"
    >
      <img
        src={avatarImg}
        alt=""
        className="h-52 w-52 object-contain transition-all duration-500 lg:h-64 lg:w-64"
        draggable={false}
        style={lightsOn ? { filter: 'invert(1) hue-rotate(180deg)' } : {
          WebkitMaskImage: mask,
          maskImage: mask,
        }}
      />
    </div>
  );
}

function StatsBar() {
  const stats = [
    { label: 'PROJECTS', value: '10+' },
    { label: 'PLATFORMS', value: '3' },
    { label: 'TECH STACK', value: '12+' },
    { label: 'COMMITS', value: '∞' },
  ];
  return (
    <motion.div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-12 px-6" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8 }}>
      {stats.map((stat, i) => (
        <motion.div key={stat.label} className="text-center" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
          <div className="text-4xl font-black text-white md:text-5xl">{stat.value}</div>
          <div className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-white/30">{stat.label}</div>
        </motion.div>
      ))}
    </motion.div>
  );
}

// ─── Featured projects — alternating scroll cards ──────────
function FeaturedProjects() {
  return (
    <div className="mx-auto max-w-5xl space-y-24 px-6 md:space-y-32">
      {projects.map((project, i) => (
        <ProjectShowcase key={project.id} project={project} index={i} />
      ))}
      <motion.div
        className="flex justify-center pt-8"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
      >
        <Link
          to="/apps"
          className="group inline-flex items-center gap-3 rounded-full border border-white/20 px-8 py-4 text-sm font-semibold text-white transition-all hover:border-white/50 hover:bg-white/5"
        >
          View All Projects
          <motion.span animate={{ x: [0, 4, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>→</motion.span>
        </Link>
      </motion.div>
    </div>
  );
}

function ProjectShowcase({ project, index }: { project: (typeof projects)[0]; index: number }) {
  const isEven = index % 2 === 0;
  const cardRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: cardRef,
    offset: ['start end', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 1], [60, -60]);

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, x: isEven ? -80 : 80 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-15%' }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        to={`/apps/${project.id}`}
        className={`group flex flex-col items-center gap-8 md:flex-row ${!isEven ? 'md:flex-row-reverse' : ''}`}
      >
        {/* Visual card */}
        <motion.div
          className="relative w-full overflow-hidden rounded-3xl md:w-1/2"
          style={{ y }}
        >
          <div
            className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-3xl border border-white/[0.08]"
          >
            {/* Gradient background */}
            <div
              className="absolute inset-0 opacity-25 transition-opacity duration-700 group-hover:opacity-50"
              style={{
                background: `radial-gradient(ellipse at 30% 20%, ${project.color}, transparent 60%), radial-gradient(ellipse at 70% 80%, ${project.accent}, transparent 60%)`,
              }}
            />
            {/* Emoji */}
            <motion.span
              className="relative z-10 text-8xl drop-shadow-lg md:text-9xl"
              animate={{ y: [0, -10, 0], rotate: [0, 3, -3, 0] }}
              transition={{ duration: 5, delay: index * 0.3, repeat: Infinity, ease: 'easeInOut' }}
            >
              {project.emoji}
            </motion.span>
            {/* Shine on hover */}
            <motion.div
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              style={{
                background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.04) 45%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 55%, transparent 60%)',
              }}
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 3, repeat: Infinity, repeatDelay: 4 }}
            />
          </div>
        </motion.div>

        {/* Text content */}
        <div className={`w-full md:w-1/2 ${isEven ? 'md:pl-8' : 'md:pr-8'}`}>
          <motion.span
            className="mb-3 inline-block rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em]"
            style={{ borderColor: `${project.accent}40`, color: project.accent }}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            {project.category}
          </motion.span>
          <motion.h3
            className="mb-3 text-3xl font-black tracking-tight text-white transition-colors group-hover:text-white/90 md:text-4xl"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            {project.title}
          </motion.h3>
          <motion.p
            className="mb-6 text-base leading-relaxed text-white/40 md:text-lg"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
          >
            {project.desc}
          </motion.p>
          <motion.span
            className="inline-flex items-center gap-2 text-sm font-medium text-white/50 transition-colors group-hover:text-white/80"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
          >
            詳細を見る
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </motion.span>
        </div>
      </Link>
    </motion.div>
  );
}

// ─── Tech marquee ──────────────────────────────────────────
function TechMarquee() {
  const row1 = ['React', 'TypeScript', 'AWS Lambda', 'DynamoDB', 'Tailwind CSS', 'Node.js', 'Vite', 'React Native', 'Expo', 'Firebase'];
  const row2 = ['CDK', 'CloudFront', 'S3', 'Cognito', 'API Gateway', 'Docker', 'Git', 'GitHub Actions', 'Anal Sex', 'Chart.js'];
  const heartContainerRef = useRef<HTMLDivElement>(null);

  function handleSpecialClick(e: React.MouseEvent) {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        if (!heartContainerRef.current) return;
        const el = document.createElement('span');
        el.textContent = '❤️';
        el.style.cssText = `position:fixed;left:${cx + (Math.random() - 0.5) * 40}px;top:${cy}px;font-size:18px;pointer-events:none;animation:heart-float 1.8s ease-out forwards;z-index:160;`;
        heartContainerRef.current.appendChild(el);
        setTimeout(() => el.remove(), 1800);
      }, i * 120);
    }
  }

  function Row({ items, reverse = false }: { items: string[]; reverse?: boolean }) {
    const repeated = [...items, ...items, ...items, ...items];
    return (
      <div className="overflow-hidden">
        <div
          className="flex w-max gap-3 whitespace-nowrap"
          style={{
            animation: `${reverse ? 'marquee-reverse' : 'marquee'} 40s linear infinite`,
            willChange: 'transform',
          }}
        >
          {repeated.map((item, i) => {
            const isSpecial = item === 'Anal Sex';
            return (
              <span
                key={`${item}-${i}`}
                className={`inline-block rounded-full border border-white/10 px-5 py-2 text-sm font-medium text-white/30 ${isSpecial ? 'cursor-pointer transition-colors hover:border-pink-500/30 hover:text-pink-400/50' : ''}`}
                onClick={isSpecial ? handleSpecialClick : undefined}
                style={isSpecial ? { pointerEvents: 'auto' } : undefined}
              >
                {item}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-25%); }
        }
        @keyframes marquee-reverse {
          0% { transform: translateX(-25%); }
          100% { transform: translateX(0); }
        }
        @keyframes heart-float {
          0% { opacity: 0; transform: translateY(0) scale(0.5); }
          15% { opacity: 1; transform: translateY(-10px) scale(1); }
          100% { opacity: 0; transform: translateY(-100px) scale(1.3); }
        }
      `}</style>
      <div className="space-y-3">
        <Row items={row1} />
        <Row items={row2} reverse />
      </div>
      {/* Floating hearts container — DOM-only, no React re-renders */}
      <div ref={heartContainerRef} className="pointer-events-none" />
    </>
  );
}

// ─── Playground section ───────────────────────────────────
const playgroundItems = [
  {
    to: '/clip',
    title: 'Clip',
    desc: 'テキストを貼って、リンクを生成。30分で消える。',
    icon: '📋',
    gradient: 'from-violet-500/20 to-fuchsia-500/20',
    border: 'hover:border-violet-500/30',
  },
  {
    to: '/games/2048',
    title: '2048 Time Attack',
    desc: '制限時間内にハイスコアを狙え。リプレイ検証付き。',
    icon: '🎮',
    gradient: 'from-amber-500/20 to-orange-500/20',
    border: 'hover:border-amber-500/30',
  },
];

function Playground() {
  return (
    <div className="mx-auto grid max-w-3xl gap-4 px-6 sm:grid-cols-2">
      {playgroundItems.map((item, i) => (
        <motion.div
          key={item.to}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: i * 0.1 }}
        >
          <Link
            to={item.to}
            className={`group relative block overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all duration-300 ${item.border} hover:bg-white/[0.04]`}
          >
            {/* Gradient glow on hover */}
            <div
              className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
            />

            <div className="relative z-10">
              <span className="text-3xl">{item.icon}</span>
              <h3 className="mt-4 text-lg font-bold text-white">
                {item.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-white/35 transition-colors group-hover:text-white/50">
                {item.desc}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-white/25 transition-colors group-hover:text-white/50">
                Try it
                <motion.span
                  className="inline-block"
                  animate={{ x: [0, 3, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  →
                </motion.span>
              </span>
            </div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

// ─── GitHub Contributions Graph ───────────────────────────
function ContributionGraph() {
  const [calendar, setCalendar] = useState<ContributionCalendar | null>(null);

  useEffect(() => {
    fetchContributions().then(setCalendar).catch(() => {});
  }, []);

  if (!calendar) return null;

  const cellSize = 11;
  const gap = 2;
  const weeks = calendar.weeks;
  const width = weeks.length * (cellSize + gap);
  const height = 7 * (cellSize + gap);

  return (
    <motion.div
      className="mx-auto max-w-4xl px-6"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
    >
      <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex items-center justify-between mb-3">
          <a
            href="https://github.com/kuronekorou39"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-white/40 transition-colors hover:text-white/60"
          >
            @kuronekorou39
          </a>
          <span className="text-xs text-white/25">
            {calendar.totalContributions.toLocaleString()} contributions
          </span>
        </div>
        <svg width={width} height={height} className="mx-auto block">
          {weeks.map((week, wi) =>
            week.contributionDays.map((day, di) => (
              <rect
                key={day.date}
                x={wi * (cellSize + gap)}
                y={di * (cellSize + gap)}
                width={cellSize}
                height={cellSize}
                rx={2}
                fill={day.contributionCount === 0 ? 'rgba(255,255,255,0.04)' : day.color}
                opacity={day.contributionCount === 0 ? 1 : 0.85}
              >
                <title>{`${day.date}: ${day.contributionCount} contributions`}</title>
              </rect>
            ))
          )}
        </svg>
      </div>
    </motion.div>
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
      <CursorGlow />
      <ClickRipples />

      {/* Background toys (behind content) */}
      <GlowingEyes />
      <HiddenSwitch />

      {/* ══════ HERO ══════ */}
      <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }} className="text-center">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="mb-8">
            <motion.img
              src={underConstructionImg}
              alt="準備中"
              className="mx-auto h-24 w-24 object-contain drop-shadow-lg md:h-28 md:w-28"
              draggable={false}
              animate={{ rotate: [0, 2, -2, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>

          <div className="relative inline-block">
            <HiddenAvatar />
            <h1 className="text-6xl font-black leading-[0.9] tracking-tighter md:text-8xl lg:text-[10rem]">
              <SplitText>rou39</SplitText>
            </h1>
          </div>

          <div className="mt-6 text-xl text-white/40 md:text-2xl">
            <GlitchText>Full-Stack Developer</GlitchText>
          </div>

          <motion.p className="mx-auto mt-8 max-w-md text-sm leading-relaxed text-white/20"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
            Web &bull; Mobile &bull; Extensions &bull; Tools
          </motion.p>
        </motion.div>

        <motion.div className="absolute bottom-12" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>
          <motion.div animate={{ y: [0, 10, 0] }} transition={{ duration: 2, repeat: Infinity }}
            className="text-sm font-medium tracking-widest text-white/20">
            ↓ SCROLL
          </motion.div>
        </motion.div>
      </section>

      {/* ══════ STATS ══════ */}
      <section className="relative z-10 py-24">
        <StatsBar />
      </section>

      {/* ══════ FEATURED PROJECTS ══════ */}
      <section className="relative z-10 py-32">
        <motion.div
          className="mb-20 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-white/30">Projects</h2>
          <p className="mt-3 text-3xl font-bold text-white/80 md:text-4xl">つくったもの</p>
        </motion.div>
        <FeaturedProjects />
      </section>

      {/* ══════ PLAYGROUND ══════ */}
      <section className="relative z-10 py-24">
        <motion.div
          className="mb-12 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-white/30">
            Playground
          </h2>
          <p className="mt-3 text-xl font-bold text-white/60">
            すぐに触れるやつ
          </p>
        </motion.div>
        <Playground />
      </section>

      {/* ══════ TECH MARQUEE ══════ */}
      <section className="relative z-10 py-20">
        <motion.div className="mb-12 text-center" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
          <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-white/30">Tech Stack</h2>
        </motion.div>
        <TechMarquee />
      </section>

      {/* ══════ CONTRIBUTIONS ══════ */}
      <section className="relative z-10 py-20">
        <motion.div
          className="mb-12 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-white/30">
            Activity
          </h2>
        </motion.div>
        <ContributionGraph />
      </section>

      {/* ══════ CTA ══════ */}
      <section className="relative z-10 py-32">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}>
            <h2 className="text-5xl font-black tracking-tight md:text-7xl">
              <SplitText>Let's talk.</SplitText>
            </h2>
            <p className="mt-6 text-white/30">お仕事の依頼、フィードバック、なんでも。</p>
            <motion.div className="mt-10">
              <Link to="/contact" className="group inline-flex items-center gap-4 rounded-full border border-white/20 px-10 py-5 text-sm font-semibold text-white transition-all hover:border-white/60 hover:bg-white hover:text-black">
                Contact
                <motion.span className="inline-block" animate={{ x: [0, 4, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>→</motion.span>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
