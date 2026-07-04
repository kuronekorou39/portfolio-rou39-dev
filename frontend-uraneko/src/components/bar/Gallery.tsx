import { useEffect, useState } from 'react';
import Thumbnail from './Thumbnail';

/**
 * 商品プレビューのギャラリー。メイン画像 + 下部サムネ列で 1 枚ずつ切替(◀▶ も)。
 * 画像が1枚以下なら従来どおり Thumbnail 1枚を表示する。
 */
export default function Gallery({
  images,
  code,
  title,
}: {
  images: string[];
  code?: string;
  title?: string;
}) {
  const [idx, setIdx] = useState(0);
  // 画像リストが変わったら先頭に戻す
  useEffect(() => setIdx(0), [images.join('|')]);

  const has = images.length > 0;
  const cur = has ? Math.min(idx, images.length - 1) : 0;

  // 画像ゼロ: プレースホルダ(テキスト)。1枚: 画像のみ。
  if (images.length <= 1) {
    return (
      <Thumbnail
        ratio="16/10"
        cover
        code={code}
        title={title}
        subtitle="preview"
        image={images[0] ?? null}
      />
    );
  }

  const go = (d: number) => setIdx((i) => (i + d + images.length) % images.length);

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <Thumbnail ratio="16/10" cover code={code} title={title} subtitle="preview" image={images[cur]} />
        {/* 左右送り */}
        <button
          aria-label="前へ"
          onClick={() => go(-1)}
          style={arrowStyle('left')}
        >
          ‹
        </button>
        <button
          aria-label="次へ"
          onClick={() => go(1)}
          style={arrowStyle('right')}
        >
          ›
        </button>
        {/* 位置表示 */}
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            right: 14,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: 2,
            color: 'var(--color-fg)',
            background: 'rgba(10,10,11,0.55)',
            padding: '3px 8px',
          }}
        >
          {cur + 1} / {images.length}
        </div>
      </div>

      {/* サムネ列 */}
      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        {images.map((src, i) => (
          <button
            key={src + i}
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
              src={src}
              alt=""
              loading="lazy"
              onError={(e) => {
                // 読み込み失敗したサムネは壊れたアイコンを残さず隠す
                const btn = e.currentTarget.closest('button');
                if (btn) btn.style.display = 'none';
              }}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </button>
        ))}
      </div>
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
