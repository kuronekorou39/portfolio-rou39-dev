import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Thumbnail from './Thumbnail';

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.5;

export interface GalleryImage {
  url: string; // 表示用(ぼかし指定ならぼかし版)
  zoom_url: string | null; // 拡大時に見せる原画。null なら拡大でも原画を出さない
}

/**
 * 商品プレビューのギャラリー。メイン画像 + 下部サムネ列で 1 枚ずつ切替(◀▶ も)。
 * 画像クリックでライトボックス拡大。zoom_url があればそれ(原画)を、無ければ表示画像
 * (ぼかし版)を大きく見せる — 「外れない」画像は拡大しても原画を出さない。
 */
export default function Gallery({
  images,
  code,
  title,
}: {
  images: GalleryImage[];
  code?: string;
  title?: string;
}) {
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState(false);
  // ライトボックス内の拡大率とパン(ドラッグ移動)
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ active: boolean; sx: number; sy: number; ox: number; oy: number }>({
    active: false,
    sx: 0,
    sy: 0,
    ox: 0,
    oy: 0,
  });

  const key = images.map((i) => i.url).join('|');
  useEffect(() => {
    setIdx(0);
    setZoom(false);
  }, [key]);

  const resetView = useCallback(() => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }, []);

  const go = useCallback(
    (d: number) => {
      setIdx((i) => (i + d + images.length) % images.length);
      resetView();
    },
    [images.length, resetView],
  );

  const closeZoom = useCallback(() => {
    setZoom(false);
    resetView();
  }, [resetView]);

  const zoomBy = useCallback((delta: number) => {
    setScale((s) => {
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(s + delta).toFixed(2)));
      if (next <= 1) setPos({ x: 0, y: 0 });
      return next;
    });
  }, []);

  // ライトボックス表示中: 背景スクロールを止める
  useEffect(() => {
    if (!zoom) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [zoom]);

  // ライトボックス表示中: キーボード操作(Esc 閉じる / ←→ 送り / +- ズーム)
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeZoom();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === '+' || e.key === '=') zoomBy(ZOOM_STEP);
      else if (e.key === '-') zoomBy(-ZOOM_STEP);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom, closeZoom, go, zoomBy]);

  // 画像ゼロ/1枚: 従来の Thumbnail 1枚(クリックで拡大)。
  if (images.length === 0) {
    return <Thumbnail ratio="16/10" cover code={code} title={title} subtitle="preview" image={null} />;
  }

  const cur = Math.min(idx, images.length - 1);
  const img = images[cur];
  const openZoom = () => {
    resetView();
    setZoom(true);
  };

  // ドラッグでパン(拡大中のみ)
  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    drag.current = { active: true, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    setPos({ x: drag.current.ox + (e.clientX - drag.current.sx), y: drag.current.oy + (e.clientY - drag.current.sy) });
  };
  const onPointerUp = () => {
    drag.current.active = false;
  };
  const onWheel = (e: React.WheelEvent) => {
    zoomBy(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
  };
  const toggleDoubleZoom = () => {
    if (scale > 1) resetView();
    else setScale(2);
  };

  return (
    <div>
      <div style={{ position: 'relative', cursor: 'zoom-in' }} onClick={openZoom}>
        <Thumbnail ratio="16/10" cover code={code} title={title} subtitle="preview" image={img.url} />
        {images.length > 1 && (
          <>
            <button
              aria-label="前へ"
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
              style={arrowStyle('left')}
            >
              ‹
            </button>
            <button
              aria-label="次へ"
              onClick={(e) => {
                e.stopPropagation();
                go(1);
              }}
              style={arrowStyle('right')}
            >
              ›
            </button>
            <div style={counterStyle}>
              {cur + 1} / {images.length}
            </div>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          {images.map((im, i) => (
            <button
              key={im.url + i}
              onClick={() => setIdx(i)}
              aria-label={`画像 ${i + 1}`}
              style={{
                width: 64,
                aspectRatio: '16/10',
                padding: 0,
                cursor: 'pointer',
                border: `1px solid ${i === cur ? 'var(--color-gold-bright)' : 'rgba(168,166,158,0.3)'}`,
                background: 'var(--color-panel)',
                overflow: 'hidden',
                opacity: i === cur ? 1 : 0.6,
              }}
            >
              <img
                src={im.url}
                alt=""
                loading="lazy"
                onError={(e) => {
                  const btn = e.currentTarget.closest('button');
                  if (btn) btn.style.display = 'none';
                }}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </button>
          ))}
        </div>
      )}

      {/* ライトボックス(枠を確保したポップアップ + ズーム/パン)。
          anim-reveal 等 transform を持つ親の中だと position:fixed がビューポート基準に
          ならないため、Portal で body 直下に出す。 */}
      {zoom &&
        createPortal(
        <div className="lb-backdrop" onClick={closeZoom}>
          <div className="lb-panel" onClick={(e) => e.stopPropagation()}>
            {/* ヘッダー: カウンタ + ズーム操作 + 閉じる(画像に被らない) */}
            <div className="lb-head">
              <span>
                {cur + 1} / {images.length}
                {title ? ` · ${title}` : ''}
              </span>
              <div className="lb-tools">
                <button
                  className="lb-icon"
                  aria-label="縮小"
                  onClick={() => zoomBy(-ZOOM_STEP)}
                  disabled={scale <= ZOOM_MIN}
                >
                  −
                </button>
                <span style={{ minWidth: 44, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
                <button
                  className="lb-icon"
                  aria-label="拡大"
                  onClick={() => zoomBy(ZOOM_STEP)}
                  disabled={scale >= ZOOM_MAX}
                >
                  ＋
                </button>
                <button className="lb-icon" aria-label="閉じる" onClick={closeZoom}>
                  ✕
                </button>
              </div>
            </div>

            {/* 画像表示エリア(この枠内に必ず収まる。拡大時はドラッグで移動) */}
            <div
              className="lb-stage"
              style={{ cursor: scale > 1 ? (drag.current.active ? 'grabbing' : 'grab') : 'zoom-in' }}
              onWheel={onWheel}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onDoubleClick={toggleDoubleZoom}
            >
              <img
                className="lb-img"
                src={img.zoom_url ?? img.url}
                alt={title ?? ''}
                draggable={false}
                style={{
                  transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
                  transition: drag.current.active ? 'none' : 'transform 0.12s ease-out',
                }}
              />
              {images.length > 1 && (
                <>
                  <button
                    className="lb-nav prev"
                    aria-label="前へ"
                    onClick={() => go(-1)}
                  >
                    ‹
                  </button>
                  <button
                    className="lb-nav next"
                    aria-label="次へ"
                    onClick={() => go(1)}
                  >
                    ›
                  </button>
                </>
              )}
            </div>
          </div>
        </div>,
          document.body,
        )}
    </div>
  );
}

function arrowStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    [side]: 8,
    width: 34,
    height: 34,
    display: 'grid',
    placeItems: 'center',
    border: '1px solid rgba(168,166,158,0.4)',
    background: 'rgba(10,10,11,0.5)',
    color: 'var(--color-fg)',
    fontSize: 20,
    lineHeight: 1,
    cursor: 'pointer',
  };
}

const counterStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 12,
  right: 14,
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: 2,
  color: 'var(--color-fg)',
  background: 'rgba(10,10,11,0.55)',
  padding: '3px 8px',
};
