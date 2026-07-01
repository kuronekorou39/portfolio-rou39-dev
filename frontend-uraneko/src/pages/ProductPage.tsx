import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type Product } from '../lib/api';
import Thumbnail from '../components/bar/Thumbnail';
import Ornament from '../components/bar/Ornament';
import SectionLabel from '../components/bar/SectionLabel';
import BarButton from '../components/bar/BarButton';
import BrassFrame from '../components/bar/BrassFrame';

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
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
          COLLECTION
        </Link>
        <span style={{ margin: '0 12px' }}>/</span>
        <span style={{ color: 'var(--muted)' }}>{product.product_id.toUpperCase()}</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 460px',
          gap: 56,
        }}
      >
        {/* 左:プレビュー */}
        <div>
          <Thumbnail
            ratio="16/10"
            cover
            code={`№ ${product.product_id}`}
            title={product.title}
            subtitle="preview"
          />

          <Ornament mark="❖" style={{ margin: '40px 0' }} />

          <SectionLabel style={{ marginBottom: 14 }}>— 作品について · SYNOPSIS</SectionLabel>
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
              fontSize: 40,
              fontWeight: 200,
              letterSpacing: 4,
              lineHeight: 1.3,
              margin: 0,
              color: 'var(--color-fg)',
            }}
          >
            {product.title}
          </h1>

          <Ornament mark="✦" style={{ margin: '28px 0', maxWidth: 180 }} />

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
                fontSize: 40,
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
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                fontSize: 11,
                letterSpacing: 2,
                color: 'var(--dim)',
                marginTop: 6,
              }}
            >
              payable in crypto · BTC / USDT / USDC / LTC
            </div>
          </BrassFrame>

          {product.available === false ? (
            <BarButton size="lg" disabled style={{ width: '100%', opacity: 0.5 }}>
              SOLD OUT · 在庫切れ
            </BarButton>
          ) : (
            <Link to={`/checkout/${product.product_id}`} style={{ textDecoration: 'none' }}>
              <BarButton size="lg" style={{ width: '100%' }}>
                BUY NOW · 購入へ進む
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
            ※ 本作品には購入者固有の不可視透かしが埋め込まれます。
            <br />※ 流出時には購入者の特定が可能です。
          </p>
        </div>
      </div>
    </div>
  );
}
