/**
 * ロゴ候補のショーケースページ（/logos で確認用）
 */

// ─── Shared defs for Logo A variants ───────────────────────
function LogoADefs() {
  return (
    <defs>
      <linearGradient id="logoA-bg" x1="0" y1="0" x2="100" y2="100">
        <stop offset="0%" stopColor="rgba(100,60,255,0.15)" />
        <stop offset="100%" stopColor="rgba(255,60,100,0.08)" />
      </linearGradient>
      <linearGradient id="logoA-border" x1="0" y1="0" x2="100" y2="100">
        <stop offset="0%" stopColor="rgba(255,255,255,0.2)" />
        <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
      </linearGradient>
    </defs>
  );
}

function LogoAFrame() {
  return (
    <path
      d="M8 0H92C96.4 0 100 3.6 100 8V72L72 100H8C3.6 100 0 96.4 0 92V8C0 3.6 3.6 0 8 0Z"
      fill="url(#logoA-bg)"
      stroke="url(#logoA-border)"
      strokeWidth="1.5"
    />
  );
}

function LogoALetterR() {
  return (
    <>
      <path
        d="M30 28H52C60.8 28 68 35.2 68 44V44C68 52.8 60.8 60 52 60H46L68 76"
        stroke="white"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <line x1="30" y1="28" x2="30" y2="76" stroke="white" strokeWidth="5" strokeLinecap="round" />
    </>
  );
}

// ─── A1: 39 on the cut edge (斜めカットの辺に沿って) ───────
function LogoA1({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <LogoAFrame />
      <LogoALetterR />
      {/* 39 along the diagonal cut */}
      <text x="82" y="82" fill="rgba(255,255,255,0.35)" fontSize="12" fontFamily="monospace" fontWeight="bold" transform="rotate(-45 82 82)">39</text>
      <LogoADefs />
    </svg>
  );
}

// ─── A2: 39 bottom-left (左下、Rの足元) ────────────────────
function LogoA2({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <LogoAFrame />
      <LogoALetterR />
      {/* 39 at bottom-left, small and quiet */}
      <text x="8" y="94" fill="rgba(255,255,255,0.3)" fontSize="13" fontFamily="monospace" fontWeight="bold">39</text>
      <LogoADefs />
    </svg>
  );
}

// ─── A3: 39 integrated with R (Rの脚の延長として) ──────────
function LogoA3({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <LogoAFrame />
      <LogoALetterR />
      {/* 39 right after the R's kick leg */}
      <text x="58" y="78" fill="rgba(255,255,255,0.5)" fontSize="16" fontFamily="system-ui, sans-serif" fontWeight="800">39</text>
      <LogoADefs />
    </svg>
  );
}

// ─── A4: 39 top-right variants ─────────────────────────────
function LogoA4({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <LogoAFrame />
      <LogoALetterR />
      {/* 39 — Rの右上、余白のバランスが取れた位置 */}
      <text x="68" y="24" fill="rgba(255,255,255,0.35)" fontSize="14" fontFamily="system-ui, sans-serif" fontWeight="700" letterSpacing="1">39</text>
      <LogoADefs />
    </svg>
  );
}

function LogoA4b({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <LogoAFrame />
      <LogoALetterR />
      {/* 39 — もう少し内側、Rの頭と揃える */}
      <text x="72" y="34" fill="rgba(255,255,255,0.35)" fontSize="14" fontFamily="monospace" fontWeight="bold" letterSpacing="1">39</text>
      <LogoADefs />
    </svg>
  );
}

function LogoA4c({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <LogoAFrame />
      <LogoALetterR />
      {/* 39 — 小さめ、Rの右肩にぴったり寄り添う */}
      <text x="70" y="28" fill="rgba(255,255,255,0.4)" fontSize="11" fontFamily="system-ui, sans-serif" fontWeight="800" letterSpacing="0.5">39</text>
      <LogoADefs />
    </svg>
  );
}

function LogoA4d({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <LogoAFrame />
      <LogoALetterR />
      {/* 39 — 上辺からの余白と右辺からの余白が均等 */}
      <text x="76" y="20" fill="rgba(255,255,255,0.3)" fontSize="12" fontFamily="system-ui, sans-serif" fontWeight="700" letterSpacing="2">39</text>
      <LogoADefs />
    </svg>
  );
}

// ─── A5: No 39 (Rだけ。39はロゴの外でテキスト表記) ────────
function LogoA5({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <LogoAFrame />
      {/* R centered larger */}
      <path
        d="M26 22H52C62.5 22 71 30.5 71 41V41C71 51.5 62.5 60 52 60H44L71 82"
        stroke="white"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <line x1="26" y1="22" x2="26" y2="82" stroke="white" strokeWidth="5.5" strokeLinecap="round" />
      <LogoADefs />
    </svg>
  );
}

// ─── A (original) kept for reference ───────────────────────
function LogoA({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <LogoAFrame />
      <LogoALetterR />
      <text x="74" y="94" fill="rgba(255,255,255,0.4)" fontSize="14" fontFamily="monospace" fontWeight="bold">39</text>
      <LogoADefs />
    </svg>
  );
}

// ─── B: Circuit / Tech ─────────────────────────────────────
// 回路基板モチーフ。ノードとパスで「接続」を表現
function LogoB({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="98" height="98" rx="16" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      {/* Circuit paths */}
      <path d="M20 50H35L45 35H65" stroke="rgba(120,100,255,0.5)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M20 60H30L40 75H55" stroke="rgba(120,100,255,0.3)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M65 35V55L55 65H55" stroke="rgba(120,100,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />
      {/* Nodes */}
      <circle cx="20" cy="50" r="2.5" fill="#7C64FF" />
      <circle cx="20" cy="60" r="2" fill="#7C64FF" opacity="0.6" />
      <circle cx="65" cy="35" r="3" fill="#7C64FF" />
      <circle cx="55" cy="75" r="2" fill="#7C64FF" opacity="0.5" />
      <circle cx="55" cy="65" r="2.5" fill="#7C64FF" opacity="0.7" />
      {/* Main text */}
      <text x="50" y="54" textAnchor="middle" fill="white" fontSize="28" fontFamily="system-ui, sans-serif" fontWeight="900" letterSpacing="-1">
        r39
      </text>
      {/* Glow behind text */}
      <text x="50" y="54" textAnchor="middle" fill="rgba(120,100,255,0.3)" fontSize="28" fontFamily="system-ui, sans-serif" fontWeight="900" letterSpacing="-1" filter="url(#logoB-glow)">
        r39
      </text>
      <defs>
        <filter id="logoB-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
        </filter>
      </defs>
    </svg>
  );
}

// ─── C: Stacked / Bold ─────────────────────────────────────
// 大胆に積み上げた文字。ダーク空間にパンチがある
function LogoC({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background glow */}
      <circle cx="50" cy="50" r="40" fill="url(#logoC-glow)" />
      {/* ROU */}
      <text x="50" y="42" textAnchor="middle" fill="white" fontSize="22" fontFamily="system-ui, sans-serif" fontWeight="900" letterSpacing="6">
        ROU
      </text>
      {/* Divider line */}
      <line x1="20" y1="50" x2="80" y2="50" stroke="url(#logoC-line)" strokeWidth="1" />
      {/* 39 */}
      <text x="50" y="72" textAnchor="middle" fill="white" fontSize="30" fontFamily="system-ui, sans-serif" fontWeight="900" letterSpacing="4">
        39
      </text>
      <defs>
        <radialGradient id="logoC-glow" cx="50%" cy="50%">
          <stop offset="0%" stopColor="rgba(120,100,255,0.12)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <linearGradient id="logoC-line" x1="20" y1="0" x2="80" y2="0">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="30%" stopColor="rgba(255,255,255,0.3)" />
          <stop offset="70%" stopColor="rgba(255,255,255,0.3)" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ─── D: Glitch / Cyberpunk ─────────────────────────────────
// グリッチ表現をSVGで。ダーク空間のグリッチテキストと統一感
function LogoD({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Scan lines */}
      {Array.from({ length: 20 }, (_, i) => (
        <line key={i} x1="0" y1={i * 5} x2="100" y2={i * 5} stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
      ))}
      {/* Glitch layers */}
      <text x="50" y="58" textAnchor="middle" fill="rgba(255,0,60,0.4)" fontSize="36" fontFamily="monospace" fontWeight="900" letterSpacing="-2">
        <tspan dx="-3" dy="-1">r39</tspan>
      </text>
      <text x="50" y="58" textAnchor="middle" fill="rgba(0,200,255,0.3)" fontSize="36" fontFamily="monospace" fontWeight="900" letterSpacing="-2">
        <tspan dx="3" dy="1">r39</tspan>
      </text>
      <text x="50" y="58" textAnchor="middle" fill="white" fontSize="36" fontFamily="monospace" fontWeight="900" letterSpacing="-2">
        r39
      </text>
      {/* Glitch bar */}
      <rect x="0" y="40" width="100" height="3" fill="rgba(120,100,255,0.15)" />
      <rect x="30" y="62" width="40" height="2" fill="rgba(255,0,60,0.1)" />
      {/* Corner marks */}
      <path d="M5 5H15M5 5V15" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <path d="M95 5H85M95 5V15" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <path d="M5 95H15M5 95V85" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <path d="M95 95H85M95 95V85" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
    </svg>
  );
}

// ─── E: Orb / Ethereal ─────────────────────────────────────
// 光る球体の中に文字。背景のグロウと呼応するデザイン
function LogoE({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer glow rings */}
      <circle cx="50" cy="50" r="48" stroke="rgba(120,100,255,0.08)" strokeWidth="0.5" />
      <circle cx="50" cy="50" r="42" stroke="rgba(120,100,255,0.12)" strokeWidth="0.5" />
      <circle cx="50" cy="50" r="36" stroke="rgba(120,100,255,0.18)" strokeWidth="0.5" />
      {/* Inner filled orb */}
      <circle cx="50" cy="50" r="30" fill="url(#logoE-orb)" />
      <circle cx="50" cy="50" r="30" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
      {/* Highlight */}
      <ellipse cx="42" cy="40" rx="10" ry="6" fill="rgba(255,255,255,0.08)" transform="rotate(-20 42 40)" />
      {/* Text */}
      <text x="50" y="56" textAnchor="middle" fill="white" fontSize="20" fontFamily="system-ui, sans-serif" fontWeight="800" letterSpacing="1">
        rou39
      </text>
      <defs>
        <radialGradient id="logoE-orb" cx="40%" cy="35%">
          <stop offset="0%" stopColor="rgba(140,120,255,0.25)" />
          <stop offset="60%" stopColor="rgba(80,50,200,0.12)" />
          <stop offset="100%" stopColor="rgba(20,10,60,0.3)" />
        </radialGradient>
      </defs>
    </svg>
  );
}

// ─── F: Terminal / Hacker ──────────────────────────────────
// ターミナルプロンプト風。開発者としてのアイデンティティ
function LogoF({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Terminal window */}
      <rect x="1" y="1" width="118" height="58" rx="8" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      {/* Title bar dots */}
      <circle cx="12" cy="10" r="2.5" fill="rgba(255,100,100,0.5)" />
      <circle cx="20" cy="10" r="2.5" fill="rgba(255,200,50,0.5)" />
      <circle cx="28" cy="10" r="2.5" fill="rgba(100,255,100,0.5)" />
      {/* Prompt */}
      <text x="12" y="40" fill="rgba(120,100,255,0.6)" fontSize="13" fontFamily="monospace" fontWeight="bold">
        $
      </text>
      <text x="26" y="40" fill="white" fontSize="15" fontFamily="monospace" fontWeight="bold" letterSpacing="0.5">
        rou39
      </text>
      {/* Cursor blink */}
      <rect x="82" y="28" width="8" height="16" fill="rgba(120,100,255,0.6)" rx="1">
        <animate attributeName="opacity" values="1;0;1" dur="1.2s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
}

// ─── G: Hidden Cat Geometric ───────────────────────────────
// 「r」の上部が猫の耳のシルエットになっている。気付く人だけ気付く
function LogoG({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="98" height="98" rx="14" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      {/* 「r」 with cat ears — the top of the r splits into two pointed ears */}
      <path
        d="M28 75V38C28 38 28 28 38 28H42L38 20L44 28H50C56 28 60 32 60 38C60 44 56 48 50 48H40"
        stroke="white"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Cat ear accent — subtle inner ear */}
      <path d="M38.5 22L40.5 27" stroke="rgba(120,100,255,0.4)" strokeWidth="1" strokeLinecap="round" />
      {/* 39 */}
      <text x="66" y="78" fill="white" fontSize="26" fontFamily="system-ui, sans-serif" fontWeight="900" letterSpacing="-1">
        39
      </text>
      {/* Tiny cat eyes — only visible if you look closely */}
      <circle cx="34" cy="35" r="1.2" fill="rgba(120,100,255,0.5)" />
      <circle cx="40" cy="35" r="1.2" fill="rgba(120,100,255,0.5)" />
    </svg>
  );
}

// ─── H: Cat Silhouette Negative Space ──────────────────────
// 「o」の中に猫の耳と目が隠れている
function LogoH({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer glow */}
      <circle cx="50" cy="50" r="44" stroke="rgba(120,100,255,0.08)" strokeWidth="0.5" />
      <circle cx="50" cy="50" r="38" stroke="rgba(120,100,255,0.12)" strokeWidth="0.5" />
      {/* Text: r_u39 — the o is replaced by a cat face */}
      <text x="10" y="60" fill="white" fontSize="24" fontFamily="system-ui, sans-serif" fontWeight="800" letterSpacing="0.5">
        r
      </text>
      {/* Cat face circle (the 'o') */}
      <circle cx="38" cy="52" r="10" stroke="white" strokeWidth="2.5" fill="none" />
      {/* Cat ears on the 'o' */}
      <path d="M30.5 44L33 48" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <path d="M45.5 44L43 48" stroke="white" strokeWidth="2" strokeLinecap="round" />
      {/* Cat eyes inside 'o' — tiny, subtle */}
      <ellipse cx="35" cy="52" rx="1.3" ry="2" fill="rgba(120,100,255,0.7)" />
      <ellipse cx="41" cy="52" rx="1.3" ry="2" fill="rgba(120,100,255,0.7)" />
      {/* Nose */}
      <path d="M37.5 54.5L38 55.5L38.5 54.5" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
      {/* u39 */}
      <text x="52" y="60" fill="white" fontSize="24" fontFamily="system-ui, sans-serif" fontWeight="800" letterSpacing="0.5">
        u39
      </text>
      {/* Very subtle whiskers */}
      <line x1="28" y1="53" x2="32" y2="52.5" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
      <line x1="28" y1="55" x2="32" y2="55" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
      <line x1="44" y1="52.5" x2="48" y2="53" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
      <line x1="44" y1="55" x2="48" y2="55" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
    </svg>
  );
}

// ─── I: 9-tail Cat ─────────────────────────────────────────
// 「9」の丸い部分が猫の顔、下のカーブがしっぽ
function LogoI({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="98" height="98" rx="16" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      {/* rou */}
      <text x="14" y="62" fill="white" fontSize="32" fontFamily="system-ui, sans-serif" fontWeight="900" letterSpacing="-1">
        rou
      </text>
      {/* 3 */}
      <text x="62" y="62" fill="white" fontSize="32" fontFamily="system-ui, sans-serif" fontWeight="900">
        3
      </text>
      {/* Custom 9 — cat head + tail */}
      {/* Head (the round part of 9) */}
      <circle cx="84" cy="44" r="10" stroke="white" strokeWidth="3.5" fill="none" />
      {/* Cat ears */}
      <path d="M76 36L78.5 40.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M92 36L89.5 40.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      {/* Inner ears */}
      <path d="M77 37.5L79 40" stroke="rgba(120,100,255,0.4)" strokeWidth="1" strokeLinecap="round" />
      <path d="M91 37.5L89 40" stroke="rgba(120,100,255,0.4)" strokeWidth="1" strokeLinecap="round" />
      {/* Cat eyes */}
      <ellipse cx="80.5" cy="43" rx="1.2" ry="1.8" fill="rgba(120,100,255,0.7)" />
      <ellipse cx="87.5" cy="43" rx="1.2" ry="1.8" fill="rgba(120,100,255,0.7)" />
      {/* Nose */}
      <path d="M83.5 46L84 47L84.5 46" stroke="rgba(255,255,255,0.4)" strokeWidth="0.7" strokeLinecap="round" strokeLinejoin="round" />
      {/* Tail (the descender of 9) — curvy cat tail */}
      <path d="M94 44C94 58 88 68 82 72C78 74 74 72 76 68" stroke="white" strokeWidth="3.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// ─── J: Shadow Cat ─────────────────────────────────────────
// テキストの影に猫のシルエットが潜んでいる
function LogoJ({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Cat silhouette — sits behind/below the text like a shadow */}
      <g opacity="0.12">
        {/* Body */}
        <ellipse cx="50" cy="80" rx="18" ry="8" fill="white" />
        {/* Head */}
        <circle cx="68" cy="68" r="8" fill="white" />
        {/* Ears */}
        <path d="M63 60L65 65L67 62" fill="white" />
        <path d="M69 62L71 65L73 60" fill="white" />
        {/* Tail */}
        <path d="M32 78C28 72 24 68 26 62C28 58 32 60 32 64" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none" />
      </g>
      {/* Cat eyes — the only bright hint */}
      <circle cx="66" cy="67.5" r="1" fill="rgba(120,100,255,0.5)" />
      <circle cx="70" cy="67.5" r="1" fill="rgba(120,100,255,0.5)" />
      {/* Main text */}
      <text x="50" y="52" textAnchor="middle" fill="white" fontSize="30" fontFamily="system-ui, sans-serif" fontWeight="900" letterSpacing="-1">
        rou39
      </text>
      {/* Subtle glow */}
      <text x="50" y="52" textAnchor="middle" fill="rgba(120,100,255,0.2)" fontSize="30" fontFamily="system-ui, sans-serif" fontWeight="900" letterSpacing="-1" filter="url(#logoJ-glow)">
        rou39
      </text>
      <defs>
        <filter id="logoJ-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
    </svg>
  );
}

// ─── K: Bracket Cat ────────────────────────────────────────
// コードの括弧 { } が猫の耳になっている
function LogoK({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 140 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Left bracket — shaped like a cat ear */}
      <path
        d="M18 10L8 18V42L18 50"
        stroke="rgba(120,100,255,0.5)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Inner ear */}
      <path d="M15 14L10 20" stroke="rgba(120,100,255,0.2)" strokeWidth="1" strokeLinecap="round" />
      {/* Left eye */}
      <circle cx="16" cy="30" r="1.5" fill="rgba(120,100,255,0.5)" />
      {/* Main text */}
      <text x="70" y="38" textAnchor="middle" fill="white" fontSize="22" fontFamily="monospace" fontWeight="bold" letterSpacing="1">
        rou39
      </text>
      {/* Right bracket — shaped like a cat ear */}
      <path
        d="M122 10L132 18V42L122 50"
        stroke="rgba(120,100,255,0.5)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Inner ear */}
      <path d="M125 14L130 20" stroke="rgba(120,100,255,0.2)" strokeWidth="1" strokeLinecap="round" />
      {/* Right eye */}
      <circle cx="124" cy="30" r="1.5" fill="rgba(120,100,255,0.5)" />
      {/* Subtle nose between brackets — centered tiny triangle */}
      <path d="M69.5 42L70 43.5L70.5 42" stroke="rgba(255,255,255,0.15)" strokeWidth="0.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════
export default function LogoShowcase() {
  const logos = [
    { name: 'A: Original (参考)', desc: '元の配置 — 斜めカット上に39', Component: LogoA },
    { name: 'A1: カット辺に沿う', desc: '39が斜めカットの辺に沿って斜めに配置', Component: LogoA1 },
    { name: 'A2: 左下', desc: '39が左下隅に。静かで控えめ', Component: LogoA2 },
    { name: 'A3: Rの脚の横', desc: '39がRの右下キック脚の延長上に。一体感がある', Component: LogoA3 },
    { name: 'A4: 右上 余白広め', desc: '39がRの右上、余白バランス調整', Component: LogoA4 },
    { name: 'A4b: Rの頭と揃う', desc: '39がRの上端ラインに揃い、右寄り', Component: LogoA4b },
    { name: 'A4c: 右肩に寄り添う', desc: '小さめの39がRの右肩にぴったり', Component: LogoA4c },
    { name: 'A4d: 角に均等余白', desc: '上辺・右辺からの余白が均等', Component: LogoA4d },
    { name: 'A5: Rだけ', desc: '39はロゴに入れず、横にテキストで表記する想定', Component: LogoA5 },
    { name: 'B: Circuit / Tech', desc: '回路基板モチーフ。ノードが接続を表現', Component: LogoB },
    { name: 'C: Stacked / Bold', desc: 'ROU / 39 を積み上げ。パンチがある', Component: LogoC },
    { name: 'D: Glitch / Cyberpunk', desc: 'RGB分離グリッチ。ダーク空間のテーマに一致', Component: LogoD },
    { name: 'E: Orb / Ethereal', desc: '光る球体の中に文字。背景グロウと呼応', Component: LogoE },
    { name: 'F: Terminal / Hacker', desc: 'ターミナルプロンプト風。開発者アイデンティティ', Component: LogoF },
    { name: 'G: Hidden Cat Geometric', desc: 'rの上部が猫耳に。小さな猫の目も隠れている', Component: LogoG },
    { name: 'H: Cat-o (oが猫顔)', desc: 'rouの「o」が猫の顔。耳・目・ヒゲ付き', Component: LogoH },
    { name: 'I: 9-tail Cat', desc: '「9」の丸が猫の頭、下のカーブがしっぽ', Component: LogoI },
    { name: 'J: Shadow Cat', desc: 'テキストの影に猫シルエットが潜む。目だけ光る', Component: LogoJ },
    { name: 'K: Bracket Cat', desc: '{ } が猫の耳。コードと猫の融合', Component: LogoK },
  ];

  return (
    <div className="min-h-screen bg-[#060608] px-8 py-20">
      <h1 className="mb-4 text-center text-3xl font-bold text-white">Logo Candidates</h1>
      <p className="mb-16 text-center text-sm text-white/30">ダーク背景での見え方を確認</p>

      <div className="mx-auto grid max-w-5xl gap-12 md:grid-cols-2 lg:grid-cols-3">
        {logos.map(({ name, desc, Component }) => (
          <div key={name} className="flex flex-col items-center rounded-2xl border border-white/5 bg-white/[0.02] p-8">
            {/* Normal size */}
            <Component size={80} />
            <div className="mt-6 text-center">
              <h3 className="text-sm font-bold text-white">{name}</h3>
              <p className="mt-1 text-xs text-white/30">{desc}</p>
            </div>
            {/* Small size preview */}
            <div className="mt-6 flex items-center gap-4">
              <Component size={40} />
              <Component size={24} />
              <span className="text-xs text-white/20">小さいサイズ</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
