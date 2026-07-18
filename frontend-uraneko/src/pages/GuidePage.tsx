import { Fragment, useRef, useState } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import SectionLabel from '../components/bar/SectionLabel';
import Ornament from '../components/bar/Ornament';
import { useIsNarrow } from '../lib/useIsNarrow';

/**
 * はじめての送金ガイド。図・表・カード中心。文章は最小限。
 * ステップ番号は概要(1買う/2送る/3受け取る)と説明アコーディオンを一致させる。
 * 概要の矩形はボタンで、押すと該当ステップを開いてそこまでスクロールする(revealStep)。
 * アイコン・擬似スクショはすべてインライン SVG / DOM(外部リクエストなし=CSP 準拠)。
 * 比較表は狭い画面(<=720px)でもセル内で折り返して収める(CmpTable)。
 * 個人情報はページに書かない(第三者登録が要る人は contact 経由=案B)。手数料等の変動値は断定しない。
 */

const CONTACT = 'contact@rou39.com';
const CONTACT_MAILTO = 'mailto:' + CONTACT + '?subject=' + encodeURIComponent('uraneko 送金について');

// 擬似スクショに出す見本の注文。実在の注文ではない(アドレスは伏せ字=誤送金を防ぐ)。
const SAMPLE = {
  jpy: '12,000',
  amount: '0.00031250',
  address: 'bc1q' + '●'.repeat(34),
};

// ---------- コインアイコン(インライン SVG) ----------
function CoinIcon({ coin, size = 30 }: { coin: 'btc' | 'ltc'; size?: number }) {
  const isBtc = coin === 'btc';
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={isBtc ? 'Bitcoin' : 'Litecoin'}>
      <circle cx="16" cy="16" r="16" fill={isBtc ? '#F7931A' : '#345D9D'} />
      <g transform={isBtc ? 'rotate(-8 16 16)' : ''}>
        <text x="16" y="16" textAnchor="middle" dominantBaseline="central" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="19" fill="#fff">
          {isBtc ? '₿' : 'Ł'}
        </text>
      </g>
    </svg>
  );
}

// ---------- 図記号(インライン SVG・線画で統一) ----------
const GLYPH = 'var(--color-gold-bright)';

// STEP 2 / 送金先。QR の見た目(ファインダ3つ + データ)を記号化したもの。
function QrIcon({ size = 26, color = GLYPH }: { size?: number; color?: string }) {
  const finder = (x: number, y: number) => (
    <Fragment key={`${x}-${y}`}>
      <rect x={x + 0.9} y={y + 0.9} width={8.2} height={8.2} fill="none" stroke={color} strokeWidth={1.8} />
      <rect x={x + 3.5} y={y + 3.5} width={3} height={3} fill={color} />
    </Fragment>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="QR コード">
      {finder(1, 1)}
      {finder(21, 1)}
      {finder(1, 21)}
      <g fill={color}>
        <rect x={14} y={2} width={3} height={3} />
        <rect x={14} y={8} width={3} height={3} />
        <rect x={2} y={14} width={3} height={3} />
        <rect x={8} y={14} width={3} height={3} />
        <rect x={14} y={14} width={3} height={3} />
        <rect x={20} y={14} width={3} height={3} />
        <rect x={27} y={14} width={3} height={3} />
        <rect x={20} y={20} width={4} height={4} />
        <rect x={27} y={21} width={3} height={3} />
        <rect x={21} y={27} width={3} height={3} />
        <rect x={26} y={26} width={4} height={4} />
      </g>
    </svg>
  );
}

// STEP 3。動画ファイル + 下向き矢印で「作品が手元に落ちてくる」を表す。
function VideoDownloadIcon({ size = 26, color = GLYPH }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="動画ファイルのダウンロード">
      <g fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round">
        {/* 動画ファイル(右上は角折れ) */}
        <path d="M7 2 H19 L25 8 V18 H7 Z" />
        <path d="M19 2 V8 H25" />
        {/* ダウンロード矢印 */}
        <path d="M16 20 V29" />
        <path d="M11.5 24.5 L16 29 L20.5 24.5" />
      </g>
      {/* 再生マーク */}
      <path d="M13 8 L19 11.5 L13 15 Z" fill={color} />
    </svg>
  );
}

// 取引所 = 円で買う・換金する場所。古典的な両替所(破風と列柱)。
function ExchangeIcon({ size = 26, color = GLYPH }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="取引所">
      <g fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round">
        <path d="M16 4 L29 11.5 H3 Z" />
        <path d="M8 14 V24 M16 14 V24 M24 14 V24" />
        <path d="M4.5 24.5 H27.5 M2.5 28.5 H29.5" />
      </g>
    </svg>
  );
}

// ウォレット = 持つ・送る道具。札入れ(仕切りとカードスロット)。
function WalletIcon({ size = 26, color = GLYPH }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="ウォレット">
      <g fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round">
        <rect x="3" y="8" width="26" height="18" />
        <path d="M3 13 H29" />
        <rect x="19.5" y="16" width="9.5" height="5.5" />
      </g>
    </svg>
  );
}

// 円。取引所に入っていく側を表す。
function YenIcon({ size = 26, color = GLYPH }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="日本円">
      <circle cx="16" cy="16" r="13.5" fill="none" stroke={color} strokeWidth={1.8} />
      <text x="16" y="16" textAnchor="middle" dominantBaseline="central" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="17" fill={color}>
        ¥
      </text>
    </svg>
  );
}

/**
 * 取引所・ウォレットの識別タイル。公式ロゴは使わず、頭文字 + 各社サイトの印象に寄せた色で描く
 * (=第三者の商標画像を同梱しない)。色は行を見分けるためのもので、正確なブランド指定色ではない。
 */
const BRAND = {
  gmo: { mark: 'G', color: '#0b5fa5' },
  coincheck: { mark: 'C', color: '#1667d4' },
  bitflyer: { mark: 'bF', color: '#27406e' },
  bitbank: { mark: 'b', color: '#0f8a7e' },
  trust: { mark: 'T', color: '#3375bb' },
  exodus: { mark: 'E', color: '#6b4de6' },
  metamask: { mark: 'M', color: '#e2761b' },
  ledger: { mark: 'L', color: '#4b4b57' },
} as const;

function BrandRow({ brand, name }: { brand: { mark: string; color: string }; name: string }) {
  const size = 18;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        aria-hidden
        style={{
          display: 'inline-grid',
          placeItems: 'center',
          width: size,
          height: size,
          flexShrink: 0,
          background: brand.color,
          border: '1px solid rgba(255,255,255,0.16)',
          color: '#fff',
          fontFamily: 'var(--font-sans)',
          fontWeight: 700,
          fontSize: brand.mark.length > 1 ? 8 : 10,
          lineHeight: 1,
        }}
      >
        {brand.mark}
      </span>
      <span style={{ minWidth: 0 }}>{name}</span>
    </span>
  );
}

/**
 * 擬似スクショ用の QR 風パターン。実データを持たないので読み取っても何も出ない
 * (本物の QR は注文ごとに決済ページが生成する)。式で決めるので毎回同じ見た目になる。
 */
function FakeQr({ size = 96 }: { size?: number }) {
  const n = 21;
  const inFinder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
  const modules: ReactNode[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (inFinder(x, y)) continue;
      if ((x * 5 + y * 11 + ((x * y) % 7)) % 3 === 0) {
        modules.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />);
      }
    }
  }
  const finder = (x: number, y: number) => (
    <Fragment key={`f${x}-${y}`}>
      <rect x={x + 0.5} y={y + 0.5} width={6} height={6} fill="none" stroke="#0a0a0b" strokeWidth={1} />
      <rect x={x + 2} y={y + 2} width={3} height={3} />
    </Fragment>
  );
  return (
    <svg
      width={size}
      height={size}
      viewBox="-2 -2 25 25"
      role="img"
      aria-label="送金先 QR(見本)"
      style={{ background: '#fff', display: 'block', flexShrink: 0, borderRadius: 2 }}
    >
      <g fill="#0a0a0b">
        {modules}
        {finder(0, 0)}
        {finder(14, 0)}
        {finder(0, 14)}
      </g>
    </svg>
  );
}

// ---------- 小物 ----------
function Term({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--color-gold-bright)', borderBottom: '1px dotted var(--color-gold)', cursor: 'pointer' }}
      >
        {label}
      </button>
      {open && (
        <span
          className="anim-soft"
          style={{ display: 'block', margin: '8px 0 4px', padding: '10px 14px', borderLeft: '2px solid var(--color-gold)', background: 'rgba(184,181,172,0.05)', fontSize: 12.5, lineHeight: 1.9, color: 'var(--muted)' }}
        >
          {children}
        </span>
      )}
    </>
  );
}

function Accordion({
  n,
  title,
  defaultOpen = false,
  open: openProp,
  onToggle,
  anchorRef,
  children,
}: {
  n?: string;
  title: string;
  defaultOpen?: boolean;
  /** 渡すと開閉を親が持つ(概要の矩形から開けるようにするため)。省略時は自前で持つ。 */
  open?: boolean;
  onToggle?: () => void;
  anchorRef?: (el: HTMLDivElement | null) => void;
  children: ReactNode;
}) {
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  const toggle = onToggle ?? (() => setOpenState((o) => !o));
  return (
    <div ref={anchorRef} style={{ borderTop: '1px solid var(--faint)' }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '16px 4px', textAlign: 'left' }}
      >
        {n && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--color-gold)', minWidth: 48 }}>{n}</span>}
        <span style={{ flex: 1, fontFamily: 'var(--font-serif-jp)', fontSize: n ? 16 : 14, fontWeight: 300, letterSpacing: n ? 3 : 1, color: 'var(--color-fg)' }}>{title}</span>
        <span style={{ color: 'var(--color-gold)', fontSize: 13, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>▸</span>
      </button>
      {open && (
        <div className="anim-soft" style={{ padding: '0 4px 22px', fontFamily: 'var(--font-serif-jp)', fontSize: 13.5, lineHeight: 2, color: 'var(--muted)', fontWeight: 300 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <div style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 13.5, letterSpacing: 1, color: 'var(--color-fg)', margin: '16px 0 6px' }}>■ {children}</div>;
}

function Warn({ children }: { children: ReactNode }) {
  return (
    <div style={{ margin: '14px 0', padding: '12px 14px', border: '1px solid rgba(168,67,63,0.4)', background: 'rgba(168,67,63,0.06)', fontSize: 13, lineHeight: 1.9, color: 'var(--color-fg)' }}>
      ⚠ {children}
    </div>
  );
}

function Head({ label, title }: { label: string; title: string }) {
  return (
    <div style={{ marginTop: 44, marginBottom: 14 }}>
      <SectionLabel style={{ marginBottom: 6 }}>— {label}</SectionLabel>
      <h2 style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 'clamp(18px, 4.5vw, 22px)', fontWeight: 300, letterSpacing: 3, margin: 0, color: 'var(--color-fg)' }}>{title}</h2>
    </div>
  );
}

function Mk({ good, children }: { good?: boolean; children: ReactNode }) {
  return <span style={{ color: good ? 'var(--color-gold-bright)' : 'var(--dim)' }}>{children}</span>;
}

// ---------- 擬似スクショ(実画面を JSX で再現し、番号で指し示す) ----------
function Shot({ title, caption, children }: { title: string; caption?: ReactNode; children: ReactNode }) {
  return (
    <figure style={{ margin: '12px 0 6px' }}>
      <div style={{ border: '1px solid rgba(168,166,158,0.3)', background: 'var(--color-deep)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 10px',
            borderBottom: '1px solid rgba(168,166,158,0.18)',
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: 2,
            color: 'var(--dim)',
          }}
        >
          <span aria-hidden style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ width: 5, height: 5, border: '1px solid rgba(168,166,158,0.45)' }} />
            ))}
          </span>
          {title}
        </div>
        <div style={{ padding: '16px 14px' }}>{children}</div>
      </div>
      {caption && (
        <figcaption style={{ fontSize: 11, lineHeight: 1.8, color: 'var(--dim)', marginTop: 6 }}>{caption}</figcaption>
      )}
    </figure>
  );
}

// 擬似スクショ上の番号ふせん。Legend の番号と対応する。
function Pin({ n, style }: { n: number; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: 16,
        height: 16,
        flexShrink: 0,
        borderRadius: '50%',
        background: 'var(--color-gold-bright)',
        color: 'var(--color-deep)',
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        fontWeight: 700,
        lineHeight: 1,
        ...style,
      }}
    >
      {n}
    </span>
  );
}

function Legend({ items }: { items: { n: number; t: string; d: ReactNode }[] }) {
  return (
    <div style={{ margin: '10px 0 4px' }}>
      {items.map((it) => (
        <div key={it.n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '5px 0' }}>
          <Pin n={it.n} style={{ marginTop: 4 }} />
          <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.9, color: 'var(--muted)' }}>
            <b style={{ color: 'var(--color-fg)', fontWeight: 400 }}>{it.t}</b> — {it.d}
          </div>
        </div>
      ))}
    </div>
  );
}

// 擬似スクショ内の入力欄(実画面の inputStyle に寄せた見た目のみのダミー)
function FakeField({ value, caret, style }: { value: string; caret?: boolean; style?: CSSProperties }) {
  return (
    <div
      style={{
        padding: '8px 10px',
        border: '1px solid rgba(168,166,158,0.25)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: 1,
        color: 'var(--color-fg)',
        overflowWrap: 'anywhere',
        ...style,
      }}
    >
      {value}
      {caret && <span style={{ color: 'var(--color-gold)' }}> ▾</span>}
    </div>
  );
}

function FakeLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--color-gold)', margin: '12px 0 5px' }}>
      {children}
    </div>
  );
}

// ---------- ルート図 ----------
type NodeKind = 'yen' | 'exchange' | 'wallet' | 'dest';

const NODE_LABEL: Record<NodeKind, string> = {
  yen: '円',
  exchange: '取引所',
  wallet: 'ウォレット',
  dest: '送金先',
};

function NodeGlyph({ kind, size }: { kind: NodeKind; size: number }) {
  if (kind === 'yen') return <YenIcon size={size} />;
  if (kind === 'exchange') return <ExchangeIcon size={size} />;
  if (kind === 'wallet') return <WalletIcon size={size} />;
  return <QrIcon size={size} />;
}

/**
 * ルート1本を「記号の鎖」で表す。最長は4ノード(円→取引所→ウォレット→送金先)で、
 * これが 320px 幅でも1行に収まるよう、極狭(<=400px)ではノードと矢印を詰める。
 * 折り返すと矢印が行末で宙に浮き「送金先」が鎖から切れて見えるため、収めることを優先する
 * (flexWrap は万一収まらなかったときに横スクロールを出さないための保険)。
 */
function RouteCard({
  title,
  who,
  nodes,
  note,
  isNarrow,
  isTiny,
}: {
  title: string;
  who: string;
  nodes: NodeKind[];
  note: ReactNode;
  isNarrow: boolean;
  isTiny: boolean;
}) {
  const iconSize = isTiny ? 16 : isNarrow ? 18 : 22;
  return (
    <div style={{ border: '1px solid var(--faint)', background: 'var(--color-panel)', padding: isNarrow ? '14px 12px' : '16px 18px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 14, letterSpacing: 2, color: 'var(--color-fg)' }}>{title}</span>
        <span style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 10.5, letterSpacing: 1, color: 'var(--color-gold)', border: '1px solid rgba(168,166,158,0.3)', padding: '2px 7px' }}>
          {who}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap', marginBottom: 10 }}>
        {nodes.map((kind, i) => (
          <Fragment key={`${kind}-${i}`}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                padding: isTiny ? '7px 3px' : isNarrow ? '8px 5px' : '10px 8px',
                minWidth: isTiny ? 40 : isNarrow ? 54 : 72,
                border: `1px solid ${kind === 'dest' ? 'rgba(184,181,172,0.5)' : 'var(--faint)'}`,
                background: kind === 'dest' ? 'rgba(184,181,172,0.06)' : 'transparent',
              }}
            >
              <NodeGlyph kind={kind} size={iconSize} />
              <span style={{ fontFamily: 'var(--font-serif-jp)', fontSize: isTiny ? 9 : isNarrow ? 9.5 : 11, letterSpacing: isTiny ? 0 : 0.5, color: 'var(--color-fg)', whiteSpace: 'nowrap' }}>
                {NODE_LABEL[kind]}
              </span>
            </div>
            {i < nodes.length - 1 && (
              <span
                aria-hidden
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--color-gold)',
                  fontSize: isTiny ? 11 : 13,
                  padding: isTiny ? '0 2px' : isNarrow ? '0 4px' : '0 8px',
                }}
              >
                →
              </span>
            )}
          </Fragment>
        ))}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.8, color: 'var(--muted)' }}>{note}</div>
    </div>
  );
}

// ---------- 比較(表のまま維持。狭い画面はセル内で折り返す) ----------
const th: CSSProperties = {
  textAlign: 'left',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: 1,
  color: 'var(--color-gold)',
  padding: '9px 8px',
  borderBottom: '1px solid rgba(168,166,158,0.3)',
  whiteSpace: 'nowrap',
};
const td: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 300,
  color: 'var(--muted)',
  padding: '10px 8px',
  borderBottom: '1px solid var(--faint)',
  verticalAlign: 'top',
  lineHeight: 1.7,
  overflowWrap: 'anywhere',
};
const tdName: CSSProperties = { ...td, color: 'var(--color-fg)' };

function CmpTable({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  // 表は表のまま維持。minWidth を持たせず、狭い画面ではセル内で折り返して収める
  // (横スクロールバーを出さない)。overflowX は万一の保険。
  return (
    <div style={{ overflowX: 'auto', margin: '6px 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-serif-jp)' }}>
        <thead>
          <tr>{columns.map((c, i) => <th key={i} style={th}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>{r.map((c, ci) => <td key={ci} style={ci === 0 ? tdName : td}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 比較表の見出し。種別グリフを添えて「取引所の表/ウォレットの表」を一目で分ける。
function CmpHead({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 2px' }}>
      {icon}
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--color-gold)' }}>{children}</span>
    </div>
  );
}

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ flex: 1, minWidth: 220, border: '1px solid var(--faint)', background: 'var(--color-panel)', padding: '16px 18px', ...style }}>{children}</div>
  );
}

function CoinCard({ coin, name, tag, pros, cons }: { coin: 'btc' | 'ltc'; name: string; tag: string; pros: string[]; cons: string[] }) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <CoinIcon coin={coin} size={30} />
        <span style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 16, fontWeight: 300, letterSpacing: 2, color: 'var(--color-fg)' }}>{name}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 12, color: 'var(--muted)', fontWeight: 300, marginBottom: 12, lineHeight: 1.7 }}>{tag}</div>
      <div style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 12.5, lineHeight: 1.9, fontWeight: 300 }}>
        {pros.map((p) => (
          <div key={p} style={{ color: 'var(--muted)' }}>
            <Mk good>○</Mk> {p}
          </div>
        ))}
        {cons.map((c) => (
          <div key={c} style={{ color: 'var(--dim)' }}>
            <Mk>△</Mk> {c}
          </div>
        ))}
      </div>
    </Card>
  );
}

// 取引所 / ウォレットの役割カード
function DefCard({ icon, name, tag, note }: { icon: ReactNode; name: string; tag: string; note: ReactNode }) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        {icon}
        <span style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 16, fontWeight: 300, letterSpacing: 2, color: 'var(--color-fg)' }}>{name}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--color-gold)', marginBottom: 10 }}>{tag}</div>
      <div style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 12.5, lineHeight: 1.9, fontWeight: 300, color: 'var(--muted)' }}>{note}</div>
    </Card>
  );
}

/**
 * 概要の矩形 → 詳細アコーディオンへ。ヘッダー高ぶんの余白を空けて着地させる。
 * (Layout のヘッダーは position:sticky 指定だが、index.css の html/body の overflow-x:hidden で
 *  overflow-y が auto になり、現状は実際には貼り付かず流れて消える。貼り付くようになっても
 *  見出しが隠れないよう、この余白は確保しておく。)
 */
function scrollToAnchor(el: HTMLDivElement | null) {
  if (!el) return;
  const headerH = document.querySelector('header')?.getBoundingClientRect().height ?? 0;
  const top = window.scrollY + el.getBoundingClientRect().top - headerH - 12;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
}

export default function GuidePage() {
  const isNarrow = useIsNarrow();
  // 小型スマホ(iPhone SE 等)。4ノードのルート図を1行に収めるためだけの追加ブレークポイント。
  const isTiny = useIsNarrow(400);
  const arrow = isNarrow ? '↓' : '→';

  // STEP の開閉は概要の矩形からも操作するので親で持つ。初期は STEP 1 だけ開く。
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({ '1': true });
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const stepProps = (n: string) => ({
    open: !!openSteps[n],
    onToggle: () => setOpenSteps((s) => ({ ...s, [n]: !s[n] })),
    anchorRef: (el: HTMLDivElement | null) => {
      stepRefs.current[n] = el;
    },
  });

  // 概要の矩形は「開いて、そこへ送る」。閉じはしない(押して閉じると迷子になる)。
  function revealStep(n: string) {
    setOpenSteps((s) => ({ ...s, [n]: true }));
    requestAnimationFrame(() => scrollToAnchor(stepRefs.current[n]));
  }

  const steps = [
    {
      n: '1',
      t: '買う',
      d: '取引所で BTC / LTC を用意',
      icon: (
        <>
          <CoinIcon coin="btc" size={22} />
          <CoinIcon coin="ltc" size={22} />
        </>
      ),
    },
    { n: '2', t: '送る', d: '表示の QR / アドレスへ送金', icon: <QrIcon size={26} /> },
    { n: '3', t: '受け取る', d: '自動でダウンロード＋メール', icon: <VideoDownloadIcon size={26} /> },
  ];

  // 用途別ルート(片方だけでもOK)
  const routes: { title: string; who: string; nodes: NodeKind[]; note: ReactNode }[] = [
    {
      title: '取引所だけ',
      who: '初めて・安心して買いたい',
      nodes: ['yen', 'exchange', 'dest'],
      note: '取引所で買って、そのまま決済ページのアドレスへ送る。初回は本人確認・送金審査あり。',
    },
    {
      title: 'ウォレットだけ',
      who: '既にコインがある・急ぎ',
      nodes: ['wallet', 'dest'],
      note: '自分のウォレットから送るだけ。取引所の審査を挟まないぶん速い。',
    },
    {
      title: '取引所 → ウォレット',
      who: '一通りやりたい・匿名性も重視',
      nodes: ['yen', 'exchange', 'wallet', 'dest'],
      note: '取引所で買って自分のウォレットへ移し、そこから送る。一般的なやり方。',
    },
  ];

  const exRows: ReactNode[][] = [
    [<BrandRow brand={BRAND.gmo} name="GMOコイン" />, '東証プライム系。手数料が比較的安いことで知られる', <Mk good>◎</Mk>, <Mk good>○</Mk>],
    [<BrandRow brand={BRAND.coincheck} name="Coincheck" />, 'アプリが分かりやすく初心者に人気', <Mk good>◎</Mk>, <Mk good>○</Mk>],
    [<BrandRow brand={BRAND.bitflyer} name="bitFlyer" />, 'BTC取引量が国内トップ級の大手', <Mk good>○</Mk>, <Mk good>○</Mk>],
    [<BrandRow brand={BRAND.bitbank} name="bitbank" />, '取扱通貨が多く、板取引でスプレッドが有利', <Mk good>○</Mk>, <Mk good>○</Mk>],
  ];

  const wRows: ReactNode[][] = [
    [<BrandRow brand={BRAND.trust} name="Trust Wallet" />, 'スマホアプリ', <Mk good>BTC・LTC</Mk>, '無料・多通貨・初心者向け'],
    [<BrandRow brand={BRAND.exodus} name="Exodus" />, 'スマホ / PC', <Mk good>BTC・LTC</Mk>, '見やすい UI・多通貨'],
    [<BrandRow brand={BRAND.metamask} name="MetaMask" />, 'スマホ / 拡張', <span style={{ color: 'var(--color-accent)' }}>BTCのみ</span>, 'ETH中心。LTC は非対応'],
    [<BrandRow brand={BRAND.ledger} name="Ledger" />, 'ハードウェア', <Mk good>BTC・LTC</Mk>, '最も安全・有料'],
  ];

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      {/* ヒーロー */}
      <SectionLabel style={{ marginBottom: 12 }}>— PAYMENT GUIDE</SectionLabel>
      <h1 style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 'clamp(24px, 6vw, 34px)', fontWeight: 200, letterSpacing: 4, margin: '0 0 14px', color: 'var(--color-fg)' }}>
        はじめての送金ガイド
      </h1>
      <p style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 14, lineHeight: 2, fontWeight: 300, color: 'var(--muted)', margin: '0 0 28px' }}>
        暗号資産(BTC / LTC)での支払いを、はじめての方にもわかるように。基本は
        <b style={{ color: 'var(--color-fg)' }}>3ステップ</b>。
        <span style={{ color: 'var(--color-gold-bright)' }}>下線の用語</span>や項目はタップで開きます。
      </p>

      {/* 3ステップ概要(矩形を押すと、その詳細を開いてそこまでスクロールする) */}
      <div className="anim-reveal" style={{ display: 'flex', flexDirection: isNarrow ? 'column' : 'row', alignItems: 'stretch' }}>
        {steps.map((s, i) => (
          <Fragment key={s.n}>
            <button
              type="button"
              onClick={() => revealStep(s.n)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                border: '1px solid var(--faint)',
                background: 'var(--color-panel)',
                padding: '20px 16px',
                textAlign: 'center',
                font: 'inherit',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 3, color: 'var(--color-gold)', marginBottom: 8 }}>STEP {s.n}</div>
              <div style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 22, fontWeight: 300, letterSpacing: 4, color: 'var(--color-fg)', marginBottom: 8 }}>{s.t}</div>
              <div style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 12, fontWeight: 300, color: 'var(--muted)', lineHeight: 1.7 }}>{s.d}</div>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, height: 32, marginTop: 10 }}>{s.icon}</div>
              <div style={{ marginTop: 'auto', paddingTop: 12, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--color-gold)' }}>詳しく ▾</div>
            </button>
            {i < steps.length - 1 && (
              <div aria-hidden style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-gold)', fontSize: 18, padding: isNarrow ? '6px 0' : '0 12px' }}>{arrow}</div>
            )}
          </Fragment>
        ))}
      </div>

      {/* 手順を詳しく */}
      <SectionLabel style={{ marginTop: 40, marginBottom: 2 }}>— 手順を詳しく</SectionLabel>
      <div>
        {/* STEP 1 買う */}
        <Accordion n="STEP 1" title="買う" {...stepProps('1')}>
          <Sub>どの通貨を使う?</Sub>
          <div style={{ display: 'flex', flexDirection: isNarrow ? 'column' : 'row', gap: 14 }}>
            <CoinCard
              coin="btc"
              name="BTC ビットコイン"
              tag="最も普及した主要通貨。持っている人が多い。"
              pros={['最も広く対応している', '知名度が高く安心']}
              cons={['確認が遅め(約10分)', '混雑時は手数料が上がることも']}
            />
            <CoinCard
              coin="ltc"
              name="LTC ライトコイン"
              tag="ビットコインの軽量版。送金に向く。"
              pros={['確認が速い(約2.5分)', '手数料が安定して低め']}
              cons={['BTC より知名度は低い']}
            />
          </div>
          <div style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.8, marginTop: 8 }}>
            どちらでも購入できます。使い慣れている方・お持ちの方で。ETH / USDT などのステーブルコイン等は
            <b style={{ color: 'var(--muted)' }}>現在未対応</b>です。
          </div>

          <Sub>どのルートで用意する?</Sub>
          <div style={{ display: 'flex', flexDirection: isNarrow ? 'column' : 'row', gap: 14, margin: '10px 0 16px' }}>
            <DefCard
              icon={<ExchangeIcon size={26} />}
              name="取引所"
              tag="円で買う・換金する"
              note={
                <>
                  円 ⇄ BTC / LTC の両替所。<b style={{ color: 'var(--color-fg)' }}>円に戻せるのは取引所だけ</b>。
                  口座開設に本人確認が要ります。
                </>
              }
            />
            <DefCard
              icon={<WalletIcon size={26} />}
              name="ウォレット"
              tag="持つ・送る"
              note={
                <>
                  自分の財布。<b style={{ color: 'var(--color-fg)' }}>審査がなくすぐ送れる</b>のが利点。
                  買う機能は基本ありません。
                </>
              }
            />
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.9, fontWeight: 300, marginBottom: 10 }}>
            <b style={{ color: 'var(--color-fg)' }}>どちらか一方だけでも大丈夫</b>です。合うルートを選んでください。
          </div>
          {routes.map((r) => (
            <RouteCard key={r.title} {...r} isNarrow={isNarrow} isTiny={isTiny} />
          ))}

          <CmpHead icon={<ExchangeIcon size={18} />}>取引所くらべ(買う・換金)</CmpHead>
          <CmpTable columns={['取引所', '特徴', '初心者', 'BTC/LTC']} rows={exRows} />

          <CmpHead icon={<WalletIcon size={18} />}>ウォレットくらべ(持つ・送る)</CmpHead>
          <CmpTable columns={['ウォレット', 'タイプ', '対応', '特徴']} rows={wRows} />

          <div style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.8, marginTop: 6 }}>
            ※ 手数料・対応コインは変わるので、各公式で確認を。円への換金(売却)は取引所だけ。
            <br />※ 左のタイルは行を見分けるための目印で、各社の公式ロゴではありません。
          </div>
        </Accordion>

        {/* STEP 2 送る */}
        <Accordion n="STEP 2" title="送る" {...stepProps('2')}>
          <div>
            やることは、決済ページに出る<b style={{ color: 'var(--color-fg)' }}>「数量」と「送金先アドレス」</b>を、
            取引所かウォレットの送金画面に入れるだけ。QR を読み取れば、その2つは自動で入ります。
          </div>

          <Sub>まず、決済ページに出るもの</Sub>
          <Shot title="uraneko · 決済ページ(送金待ち)">
            <SectionLabel style={{ marginBottom: 10 }}>— PAYMENT · 送金</SectionLabel>
            <div style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 13, fontWeight: 300, letterSpacing: 1, color: 'var(--color-fg)', marginBottom: 4 }}>
              BTC で ¥{SAMPLE.jpy} を送金
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 300, color: 'var(--color-gold-bright)' }}>{SAMPLE.amount} BTC</span>
              <Pin n={1} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
              <FakeQr size={96} />
              <Pin n={2} style={{ marginTop: 4 }} />
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--color-gold)' }}>送金先アドレス(BTC ネットワーク)</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', marginTop: 6, flexWrap: 'wrap' }}>
              <code
                style={{
                  flex: '1 1 180px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--color-fg)',
                  background: 'rgba(168,166,158,0.08)',
                  border: '1px solid rgba(168,166,158,0.25)',
                  padding: '8px 10px',
                  wordBreak: 'break-all',
                  lineHeight: 1.6,
                }}
              >
                {SAMPLE.address}
              </code>
              <span
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  flex: '0 0 auto',
                  border: '1px solid rgba(214,183,110,0.5)',
                  color: 'var(--color-gold)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: 2,
                  padding: '0 14px',
                }}
              >
                コピー
              </span>
              <Pin n={3} style={{ alignSelf: 'center' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--muted)' }}>
              <span className="wait-dot" style={{ width: 8, height: 8 }} />
              送金を待っています…
              <Pin n={4} />
            </div>
          </Shot>
          <Legend
            items={[
              { n: 1, t: '数量', d: <>円ではなく <b style={{ color: 'var(--muted)' }}>BTC / LTC の数量</b>を、表示どおりそのまま送ります。</> },
              {
                n: 2,
                t: 'QR',
                d: (
                  <Term label="送金先と数量が両方入っている">
                    QR には送金先アドレスと送るべき数量が入っています。読み取れば手入力のミス(桁・アドレス
                    間違い)を防げます。ネットワークも通常は自動で正しく選ばれます。
                  </Term>
                ),
              },
              { n: 3, t: '送金先アドレス', d: <>QR が使えないとき用。コピーして貼ります。<b style={{ color: 'var(--muted)' }}>アドレスは注文ごとに変わる</b>ので、必ずその画面のものを。</> },
              { n: 4, t: '送金待ち', d: <>送ると<b style={{ color: 'var(--muted)' }}>この画面のまま自動で切り替わります</b>。手動更新は不要です。</> },
            ]}
          />

          <Sub>次に、取引所 / ウォレットで送る</Sub>
          <Shot
            title="取引所 / ウォレットの送金画面(共通イメージ)"
            caption="※ 呼び方は各社で違います(「出金」「送付」「送金」など)。項目の意味は同じです。"
          >
            <FakeLabel>送付先の種類</FakeLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FakeField value="プライベートウォレット" caret style={{ flex: '1 1 auto' }} />
              <Pin n={5} />
            </div>

            <FakeLabel>保有者</FakeLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              {[
                { label: '第三者', on: false },
                { label: 'ご本人さま', on: true },
              ].map((o) => (
                <span key={o.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-serif-jp)', fontSize: 12, color: o.on ? 'var(--color-fg)' : 'var(--dim)' }}>
                  <span
                    aria-hidden
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      border: `1px solid ${o.on ? 'var(--color-gold-bright)' : 'rgba(168,166,158,0.5)'}`,
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {o.on && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-gold-bright)' }} />}
                  </span>
                  {o.label}
                </span>
              ))}
              <Pin n={6} />
            </div>

            <FakeLabel>宛先アドレス</FakeLabel>
            <FakeField value={SAMPLE.address} />

            <FakeLabel>通貨 / ネットワーク</FakeLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FakeField value="BTC · Bitcoin" caret style={{ flex: '1 1 auto' }} />
              <Pin n={7} />
            </div>

            <FakeLabel>数量</FakeLabel>
            <FakeField value={`${SAMPLE.amount} BTC`} />

            <div
              style={{
                marginTop: 14,
                padding: '9px 0',
                textAlign: 'center',
                border: '1px solid rgba(168,166,158,0.5)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: 3,
                color: 'var(--color-gold-bright)',
              }}
            >
              送金する
            </div>
          </Shot>
          <Legend
            items={[
              {
                n: 5,
                t: '送付先の種類',
                d: (
                  <Term label="「プライベートウォレット」を選ぶ">
                    取引所ではない送金先は「プライベートウォレット」を選びます。ここを間違えると送金先の登録が
                    通らないことがあります。
                  </Term>
                ),
              },
              {
                n: 6,
                t: '保有者',
                d: (
                  <>
                    <b style={{ color: 'var(--muted)' }}>「ご本人さま(自分)」</b>を選ぶと、受取人の氏名入力は不要です。
                    架空の名前は入れないでください(凍結の原因になります)。
                  </>
                ),
              },
              { n: 7, t: 'ネットワーク', d: <>BTC は Bitcoin、LTC は Litecoin。QR を読めば通常は自動で正しく選ばれます。</> },
            ]}
          />
          <Warn>
            必ず選んだ通貨の{' '}
            <Term label="そのままのネットワーク">
              BTC は Bitcoin、LTC は Litecoin ネットワーク。「BEP-20」など
              <b style={{ color: 'var(--color-fg)' }}>別ネットワークは別物</b>で、そちらで送ると届かず戻らないことが
              あります(QR を読めば通常は自動で正しく選ばれます)。
            </Term>
            {' '}で送ってください。
          </Warn>
          <div style={{ marginTop: 4, padding: '12px 14px', border: '1px solid rgba(214,183,110,0.3)', background: 'rgba(184,181,172,0.05)', fontSize: 12.5, lineHeight: 1.9, color: 'var(--muted)' }}>
            ◇ 取引所で「受取人(第三者)情報」の登録が必要な場合は、
            <a href={CONTACT_MAILTO} style={{ color: 'var(--color-gold-bright)' }}> {CONTACT}</a>{' '}
            までご連絡ください。登録に必要な情報を個別にお渡しします
            <span style={{ color: 'var(--dim)' }}>(過去にやり取りのある方もどうぞ)</span>。
          </div>
        </Accordion>

        {/* STEP 3 受け取る */}
        <Accordion n="STEP 3" title="受け取る" {...stepProps('3')}>
          <div>
            送金が検知されると、開いたままの決済ページが<b style={{ color: 'var(--color-fg)' }}>自動でダウンロードに切り替わります</b>。
            待っている間、何か操作する必要はありません。
          </div>

          <Sub>切り替わったあとの画面</Sub>
          <Shot title="uraneko · 決済ページ(送金の検知後)">
            <SectionLabel style={{ marginBottom: 8 }}>— DELIVERED · CONFIRMING</SectionLabel>
            <div style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 24, fontWeight: 200, letterSpacing: 4, color: 'var(--color-fg)', lineHeight: 1.3 }}>受け渡し可能</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--muted)', marginTop: 6 }}>payment detected — download now.</div>
            <Ornament style={{ margin: '16px 0', maxWidth: 200 }} />
            <SectionLabel style={{ marginBottom: 10 }}>— FILE · 受け渡し</SectionLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '11px 22px',
                  border: '1px solid var(--color-gold-bright)',
                  background: 'rgba(184,181,172,0.08)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: 3,
                  color: 'var(--color-gold-bright)',
                }}
              >
                ↓ DOWNLOAD · 取得
              </span>
              <Pin n={1} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, color: 'var(--dim)', lineHeight: 1.9 }}>
                ※ このリンクは購入者専用。共有不可。
                <br />※ 有効期限 15 分。
              </span>
              <Pin n={2} style={{ marginTop: 14 }} />
            </div>
          </Shot>
          <Legend
            items={[
              { n: 1, t: 'すぐ押せる', d: <>ブロックチェーンの<b style={{ color: 'var(--muted)' }}>最終確認を待つ必要はありません</b>。押せばそのまま保存できます。</> },
              { n: 2, t: '期限が切れても大丈夫', d: <>リンクの期限は 15 分ですが、<b style={{ color: 'var(--muted)' }}>LIBRARY(購入記録)から何度でも取り直せます</b>。</> },
            ]}
          />

          <Sub>画面は閉じてしまって大丈夫</Sub>
          <div>
            ご登録のメールにも受け渡しリンクが届きます。
            ヘッダーの <b style={{ color: 'var(--color-fg)' }}>LIBRARY</b> からもいつでも取り直せるので、
            送金したあとは画面を閉じて構いません(取引所の出金審査で反映が遅れても、着金し次第そのままお渡しします)。
          </div>
        </Accordion>
      </div>

      {/* FAQ */}
      <Head label="FAQ" title="よくある質問" />
      <div>
        <Accordion title="送金待ちが「時間切れ」になった">
          大丈夫です。送金先アドレスは<b style={{ color: 'var(--color-fg)' }}>約7日間有効</b>で、画面が時間切れ表示に
          なっても、着金すれば自動でお渡しします。ただし<b style={{ color: 'var(--color-fg)' }}>①そのアドレスの数量を送る
          ②二重に送らない</b>。迷ったら新しい注文の新アドレス＋新数量で1回だけ送るのが確実です。
        </Accordion>
        <Accordion title="取引所で出金が「保留 / 審査中」になる">
          取引所の初回審査(30分前後)です。当方側は正常で、コインはまだブロックチェーンに出ていないだけ。
          審査が終わって着金すれば、自動でお渡しします。
        </Accordion>
        <Accordion title="アドレスが前と変わっている">
          注文を作り直すとアドレスも数量も新しくなります。<b style={{ color: 'var(--color-fg)' }}>使うアドレスと数量はセット</b>で、
          どれか1つの注文にだけ送ってください(二重送金に注意)。
        </Accordion>
        <Accordion title="BTC で払ったのに LTC で届いた">
          ごく少額(¥2,700 未満のBTC)のときだけ、送れずに自動変換されることがあります。
          <b style={{ color: 'var(--color-fg)' }}>通常価格の購入なら、BTC はBTCのまま</b>届きます。
        </Accordion>
        <Accordion title="送金したのに反映されない">
          まず取引所の<b style={{ color: 'var(--color-fg)' }}>出金履歴</b>を確認(「保留」でないか、送金ID=txid が出ているか)。
          数時間たっても届かず不安なときは、<b style={{ color: 'var(--color-fg)' }}>注文番号</b>を添えてご連絡ください。
        </Accordion>
      </div>

      <Ornament style={{ margin: '36px 0 24px' }} />

      {/* 困ったら連絡 */}
      <div style={{ padding: '18px 20px', border: '1px solid rgba(214,183,110,0.35)', background: 'rgba(214,183,110,0.05)' }}>
        <div style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 14, fontWeight: 300, letterSpacing: 1, color: 'var(--color-gold-bright)', marginBottom: 8 }}>
          こまったら、気軽に連絡してね
        </div>
        <p style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 12.5, lineHeight: 2, letterSpacing: 1, color: 'var(--muted)', fontWeight: 300, margin: 0 }}>
          わからないことは何でも大丈夫です。はじめての暗号資産でも、こちらで一緒に確認します。
          <br />
          <a href={CONTACT_MAILTO} style={{ color: 'var(--color-gold-bright)', textDecoration: 'underline' }}>{CONTACT}</a>
        </p>
      </div>
    </div>
  );
}
