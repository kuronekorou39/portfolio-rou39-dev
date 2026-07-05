import { useEffect, useState } from 'react';
import Thumbnail from './Thumbnail';

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
  const key = images.map((i) => i.url).join('|');
  useEffect(() => {
    setIdx(0);
    setZoom(false);
  }, [key]);

  // 画像ゼロ/1枚: 従来の Thumbnail 1枚(クリックで拡大)。
  if (images.length === 0) {
    return <Thumbnail ratio="16/10" cover code={code} title={title} subtitle="preview" image={null} />;
  }

  const cur = Math.min(idx, images.length - 1);
  const img = images[cur];
  const go = (d: number) => setIdx((i) => (i + d + images.length) % images.length);

  return (
    <div>
      <div style={{ position: 'relative', cursor: 'zoom-in' }} onClick={() => setZoom(true)}>
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

      {/* ライトボックス */}
      {zoom && (
        <div
          onClick={() => setZoom(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(6,6,7,0.92)',
            display: 'grid',
            placeItems: 'center',
            cursor: 'zoom-out',
            padding: 24,
          }}
        >
          <img
            src={img.zoom_url ?? img.url}
            alt={title ?? ''}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
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
            </>
          )}
          <div
            style={{
              position: 'absolute',
              top: 18,
              right: 22,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: 2,
              color: 'var(--muted)',
            }}
          >
            {cur + 1} / {images.length} · 閉じる ✕
          </div>
        </div>
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
