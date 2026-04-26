import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Product } from '../lib/api';
import Thumbnail from '../components/bar/Thumbnail';
import Ornament from '../components/bar/Ornament';
import SectionLabel from '../components/bar/SectionLabel';

export default function HomePage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.listProducts().then(setProducts).catch((e) => setErr(e.message));
  }, []);

  return (
    <div>
      {/* ヒーロー */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 420px',
          gap: 56,
          alignItems: 'center',
          marginBottom: 80,
        }}
      >
        <div>
          <SectionLabel style={{ marginBottom: 18 }}>
            — COLLECTION № I · THE FIRST DOSSIER
          </SectionLabel>
          <h1
            style={{
              fontFamily: 'var(--font-serif-jp)',
              fontSize: 56,
              fontWeight: 200,
              letterSpacing: 6,
              lineHeight: 1.2,
              margin: 0,
              color: 'var(--color-fg)',
            }}
          >
            夜の<span style={{ color: 'var(--color-gold)' }}>帳</span>が
            <br />
            降りる前に。
          </h1>
          <div
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: 16,
              letterSpacing: 3,
              color: 'var(--muted)',
              marginTop: 18,
              fontWeight: 300,
            }}
          >
            Private works, for members only.
          </div>
          <Ornament mark="❖" style={{ margin: '32px 0', maxWidth: 260 }} />
          <p
            style={{
              fontFamily: 'var(--font-serif-jp)',
              fontSize: 14,
              lineHeight: 2,
              color: 'var(--muted)',
              fontWeight: 300,
              maxWidth: 440,
            }}
          >
            会員制映像販売所「uraneko」。
            <br />
            一本ごとに固有の印を刻んだ、個別配信作品をお届けいたします。
          </p>
        </div>

        {/* ヒーロー右:注目サムネ placeholder */}
        <div style={{ position: 'relative' }}>
          <Thumbnail
            ratio="4/5"
            cover
            code="№ 0001"
            title="——"
            subtitle="featured"
            badge="New"
          />
        </div>
      </section>

      {/* 品書セクション */}
      <section>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 24,
          }}
        >
          <div>
            <SectionLabel style={{ marginBottom: 10 }}>
              — THIS MONTH&apos;S SELECTION
            </SectionLabel>
            <h2
              style={{
                fontFamily: 'var(--font-serif-jp)',
                fontSize: 28,
                fontWeight: 300,
                letterSpacing: 6,
                margin: 0,
                color: 'var(--color-fg)',
              }}
            >
              品書
            </h2>
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: 3,
              color: 'var(--muted)',
            }}
          >
            {products ? `${products.length} WORKS` : '—'}
          </div>
        </div>

        <div className="brass-hairline" style={{ marginBottom: 32 }} />

        {err && (
          <p style={{ color: '#e66', fontFamily: 'var(--font-sans)' }}>
            読み込みエラー: {err}
          </p>
        )}
        {!products && !err && (
          <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-serif-jp)' }}>
            読み込み中...
          </p>
        )}
        {products && products.length === 0 && (
          <p
            style={{
              color: 'var(--muted)',
              fontFamily: 'var(--font-serif-jp)',
              textAlign: 'center',
              padding: '60px 0',
              letterSpacing: 2,
            }}
          >
            現在お出しできる品がございません。
          </p>
        )}

        {products && products.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 24,
            }}
          >
            {products.map((p, i) => (
              <Link
                key={p.product_id}
                to={`/product/${p.product_id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <Thumbnail
                  ratio="4/5"
                  code={`№ ${String(i + 1).padStart(4, '0')}`}
                  title={p.title}
                  subtitle={`${Math.floor(p.duration_sec / 60)} min`}
                  price={`¥ ${p.price_jpy.toLocaleString()}`}
                />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
