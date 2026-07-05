import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type Product } from '../lib/api';
import { useIsNarrow } from '../lib/useIsNarrow';
import Gallery from '../components/bar/Gallery';
import Ornament from '../components/bar/Ornament';
import SectionLabel from '../components/bar/SectionLabel';
import BarButton from '../components/bar/BarButton';
import BrassFrame from '../components/bar/BrassFrame';

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const isNarrow = useIsNarrow();
  const [product, setProduct] = useState<Product | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getProduct(id).then(setProduct).catch((e) => setErr(e.message));
  }, [id]);

  if (err)
    return (
      <p style={{ color: '#e66', fontFamily: 'var(--font-serif-jp)' }}>
        エラー: {err}
      </p>
    );
  if (!product)
    return (
      <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-serif-jp)' }}>
        読み込み中...
      </p>
    );

  return (
    <div>
      {/* パンくず */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: 4,
          color: 'var(--dim)',
          marginBottom: 36,
        }}
      >
        <Link to="/" style={{ color: 'var(--dim)', textDecoration: 'none' }}>
          INDEX
        </Link>
        <span style={{ margin: '0 12px' }}>/</span>
        <span style={{ color: 'var(--muted)' }}>{product.product_id.toUpperCase()}</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isNarrow ? '1fr' : '1fr 460px',
          gap: isNarrow ? 40 : 56,
        }}
      >
        {/* 左:プレビュー(サムネ + サンプル画像のギャラリー) */}
        <div>
          <Gallery
            code={`№ ${product.product_id}`}
            title={product.title}
            images={
              product.gallery ??
              (product.thumbnail_url ? [{ url: product.thumbnail_url, zoom_url: product.thumbnail_url }] : [])
            }
          />

          <Ornament style={{ margin: '40px 0' }} />

          <SectionLabel style={{ marginBottom: 14 }}>— DESCRIPTION · 内容</SectionLabel>
          <p
            style={{
              fontFamily: 'var(--font-serif-jp)',
              fontSize: 14,
              lineHeight: 2,
              color: 'var(--muted)',
              fontWeight: 300,
              whiteSpace: 'pre-wrap',
              margin: 0,
            }}
          >
            {product.description}
          </p>
        </div>

        {/* 右:メタ + 購入 */}
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: 4,
              color: 'var(--color-gold)',
              marginBottom: 14,
            }}
          >
            № {product.product_id}
          </div>

          <h1
            style={{
              fontFamily: 'var(--font-serif-jp)',
              fontSize: 'clamp(28px, 8vw, 40px)',
              fontWeight: 200,
              letterSpacing: 4,
              lineHeight: 1.3,
              margin: 0,
              color: 'var(--color-fg)',
            }}
          >
            {product.title}
          </h1>

          <Ornament style={{ margin: '28px 0', maxWidth: 180 }} />

          {/* スペック */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '14px 24px',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: 2,
              color: 'var(--muted)',
              marginBottom: 36,
            }}
          >
            <div>
              <div style={{ color: 'var(--dim)', fontSize: 9, letterSpacing: 3, marginBottom: 4 }}>
                DURATION
              </div>
              <div>{Math.floor(product.duration_sec / 60)} min</div>
            </div>
            <div>
              <div style={{ color: 'var(--dim)', fontSize: 9, letterSpacing: 3, marginBottom: 4 }}>
                FORMAT
              </div>
              <div>MP4 · HD</div>
            </div>
            <div>
              <div style={{ color: 'var(--dim)', fontSize: 9, letterSpacing: 3, marginBottom: 4 }}>
                LICENSE
              </div>
              <div>PERSONAL</div>
            </div>
            <div>
              <div style={{ color: 'var(--dim)', fontSize: 9, letterSpacing: 3, marginBottom: 4 }}>
                WATERMARK
              </div>
              <div>EMBEDDED</div>
            </div>
          </div>

          {/* 価格プレート */}
          <BrassFrame padding="24px 28px" style={{ marginBottom: 28 }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: 4,
                color: 'var(--color-gold)',
                marginBottom: 8,
              }}
            >
              PRICE
            </div>
            <div
              style={{
                fontFamily: 'var(--font-serif-jp)',
                fontSize: 'clamp(30px, 9vw, 40px)',
                fontWeight: 300,
                letterSpacing: 4,
                color: 'var(--color-gold-bright)',
                lineHeight: 1,
              }}
            >
              ¥ {product.price_jpy.toLocaleString()}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: 2,
                color: 'var(--dim)',
                marginTop: 6,
              }}
            >
              crypto only · btc / usdt / usdc / ltc
            </div>
          </BrassFrame>

          {product.available === false ? (
            <BarButton size="lg" disabled style={{ width: '100%', opacity: 0.5 }}>
              OUT OF STOCK · 在庫なし
            </BarButton>
          ) : (
            <Link to={`/checkout/${product.product_id}`} style={{ textDecoration: 'none' }}>
              <BarButton size="lg" style={{ width: '100%' }}>
                ACQUIRE · 入手する
              </BarButton>
            </Link>
          )}

          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: 2,
              color: 'var(--dim)',
              marginTop: 18,
              lineHeight: 1.8,
            }}
          >
            ※ 複製には購入者固有の識別子が埋め込まれる。
          </p>
        </div>
      </div>
    </div>
  );
}
