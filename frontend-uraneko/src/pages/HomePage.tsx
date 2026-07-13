import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Product } from '../lib/api';
import { useIsNarrow } from '../lib/useIsNarrow';
import { useInView } from '../lib/useInView';
import Thumbnail from '../components/bar/Thumbnail';
import Ornament from '../components/bar/Ornament';
import SectionLabel from '../components/bar/SectionLabel';
import Loading from '../components/bar/Loading';

// ヒーロー見出しのネタ文(一定間隔でランダムに切替)。hi がハイライト語。
const HERO_PHRASES: { pre: string; hi: string; post: string }[] = [
  { pre: 'ケモナーの', hi: '闇', post: '' },
  { pre: '公衆', hi: 'トイレ', post: '' },
  { pre: '', hi: 'ＡＶ', post: '（アニマルビデオ）' },
  { pre: '肉', hi: '便器', post: '' },
  { pre: 'ケモナーの', hi: '種壺', post: '' },
  { pre: 'ベアバック', hi: 'ラブ', post: '' },
  { pre: 'ロワ汁', hi: 'タンク', post: '' },
  { pre: 'オフパコ', hi: 'せんにん', post: '' },
];
export default function HomePage() {
  const isNarrow = useIsNarrow();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // 収蔵グリッドは画面に入った時にカードを立ち上げる(ファーストビュー外でも動きが見える)
  const [gridRef, gridInView] = useInView();
  // ヒーロー見出しはアクセス(読み込み)ごとにランダムで1つ選ぶ
  const [phraseIdx] = useState(() => Math.floor(Math.random() * HERO_PHRASES.length));

  useEffect(() => {
    api.listProducts().then(setProducts).catch((e) => setErr(e.message));
  }, []);

  const phrase = HERO_PHRASES[phraseIdx];

  // 注目枠は管理画面で指定された1件のみ(未指定なら何も出さない)。
  const featured = products?.find((p) => p.featured) ?? null;

  return (
    <div>
      {/* ヒーロー(注目作品が無ければテキストのみの1カラム) */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: isNarrow || !featured ? '1fr' : '1fr 420px',
          gap: isNarrow ? 40 : 56,
          alignItems: 'center',
          marginBottom: isNarrow ? 56 : 80,
        }}
      >
        <div className="anim-reveal">
          <SectionLabel style={{ marginBottom: 18 }}>
            — ARCHIVE 001
          </SectionLabel>
          <h1
            style={{
              fontFamily: 'var(--font-serif-jp)',
              fontSize: 'clamp(34px, 9vw, 56px)',
              fontWeight: 200,
              letterSpacing: 6,
              lineHeight: 1.2,
              margin: 0,
              color: 'var(--color-fg)',
              minHeight: '1.2em', // 切替で高さがブレないように
            }}
          >
            {/* 読み込み時にフェードインで立ち上げる */}
            <span className="anim-soft" style={{ display: 'inline-block' }}>
              {phrase.pre}
              <span style={{ color: 'var(--color-gold-bright)' }}>{phrase.hi}</span>
              {phrase.post}
            </span>
          </h1>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              letterSpacing: 4,
              color: 'var(--muted)',
              marginTop: 18,
              fontWeight: 300,
            }}
          >
            unlisted private works.
          </div>
          <Ornament style={{ margin: '32px 0', maxWidth: 260 }} />
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
            映像を1本ずつ販売しています。
            <br />
            購入後、専用のダウンロードリンクをメールでお送りします。
          </p>
        </div>

        {/* ヒーロー右:注目作品(管理画面で指定。未指定なら枠ごと出さない) */}
        {featured && (
          <div className="anim-reveal anim-delay-2" style={{ position: 'relative' }}>
            <Link
              to={`/product/${featured.product_id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <Thumbnail
                ratio="4/5"
                cover
                code={`№ ${featured.product_id}`}
                title={featured.title}
                subtitle={`${Math.floor(featured.duration_sec / 60)} min`}
                price={`¥ ${featured.price_jpy.toLocaleString()}`}
                badge={featured.available === false ? '在庫切れ' : '注目'}
                image={featured.thumbnail_url}
              />
            </Link>
          </div>
        )}
      </section>

      {/* 収蔵一覧セクション */}
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
              — INDEX
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
              収蔵
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
            {products ? `${products.length} FILES` : '—'}
          </div>
        </div>

        <div className="brass-hairline" style={{ marginBottom: 32 }} />

        {err && (
          <p style={{ color: '#e66', fontFamily: 'var(--font-sans)' }}>
            読み込みエラー: {err}
          </p>
        )}
        {!products && !err && <Loading pad="40px 0" />}
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
            現在、収蔵はない。
          </p>
        )}

        {products && products.length > 0 && (
          <div
            ref={gridRef}
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
                className={gridInView ? 'anim-reveal' : undefined}
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  // 画面に入るまでは隠し、入ったら少しずつ遅らせて立ち上げる
                  opacity: gridInView ? undefined : 0,
                  animationDelay: `${Math.min(i, 10) * 0.06}s`,
                }}
              >
                <Thumbnail
                  ratio="4/5"
                  code={`№ ${String(i + 1).padStart(4, '0')}`}
                  title={p.title}
                  subtitle={`${Math.floor(p.duration_sec / 60)} min`}
                  price={`¥ ${p.price_jpy.toLocaleString()}`}
                  badge={p.available === false ? '在庫切れ' : undefined}
                  image={p.thumbnail_url}
                />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
