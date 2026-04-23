import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Product } from '../lib/api';

export default function HomePage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.listProducts().then(setProducts).catch((e) => setErr(e.message));
  }, []);

  if (err) return <p className="text-red-400">読み込みエラー: {err}</p>;
  if (!products) return <p className="text-neutral-400">読み込み中...</p>;
  if (products.length === 0)
    return <p className="text-neutral-400">現在販売中の商品はありません。</p>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">商品一覧</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {products.map((p) => (
          <Link
            key={p.product_id}
            to={`/product/${p.product_id}`}
            className="block overflow-hidden rounded-lg border border-white/10 bg-neutral-900 transition hover:border-white/30"
          >
            <div className="aspect-video w-full bg-neutral-800" />
            <div className="p-3">
              <h3 className="truncate text-sm font-medium">{p.title}</h3>
              <p className="mt-1 text-xs text-neutral-400">
                {Math.floor(p.duration_sec / 60)} 分
              </p>
              <p className="mt-2 text-right text-sm font-bold">
                ¥ {p.price_jpy.toLocaleString()}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
