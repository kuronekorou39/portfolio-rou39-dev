export default function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Frame with cut corner */}
      <path
        d="M8 0H92C96.4 0 100 3.6 100 8V72L72 100H8C3.6 100 0 96.4 0 92V8C0 3.6 3.6 0 8 0Z"
        fill="url(#logo-bg)"
        stroke="url(#logo-border)"
        strokeWidth="1.5"
      />
      {/* R letterform */}
      <path
        d="M30 28H52C60.8 28 68 35.2 68 44V44C68 52.8 60.8 60 52 60H46L68 76"
        stroke="white"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <line x1="30" y1="28" x2="30" y2="76" stroke="white" strokeWidth="5" strokeLinecap="round" />
      {/* 39 — small, tucked at R's right shoulder */}
      <text
        x="70"
        y="28"
        fill="rgba(255,255,255,0.4)"
        fontSize="11"
        fontFamily="system-ui, sans-serif"
        fontWeight="800"
        letterSpacing="0.5"
      >
        39
      </text>
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="100" y2="100">
          <stop offset="0%" stopColor="rgba(100,60,255,0.15)" />
          <stop offset="100%" stopColor="rgba(255,60,100,0.08)" />
        </linearGradient>
        <linearGradient id="logo-border" x1="0" y1="0" x2="100" y2="100">
          <stop offset="0%" stopColor="rgba(255,255,255,0.2)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
        </linearGradient>
      </defs>
    </svg>
  );
}
