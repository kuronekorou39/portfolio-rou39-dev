import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type Product } from '../lib/api';

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getProduct(id).then(setProduct).catch((e) => setErr(e.message));
  }, [id]);

  if (err) return <p className="text-red-400">エラー: {err}</p>;
  if (!product) return <p className="text-neutral-400">読み込み中...</p>;

  return (
    <article>
      <div className="aspect-video w-full rounded-lg bg-neutral-800" />
      <h1 className="mt-6 text-2xl font-bold">{product.title}</h1>
      <p className="mt-2 text-sm text-neutral-400">
        再生時間 {Math.floor(product.duration_sec / 60)} 分 ・ ¥
        {product.price_jpy.toLocaleString()}
      </p>
      <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
        {product.description}
      </p>
      <div className="mt-8">
        <Link
          to={`/checkout/${product.product_id}`}
          className="inline-block rounded-md bg-white px-5 py-2 text-sm font-medium text-black hover:bg-neutral-200"
        >
          購入手続きへ
        </Link>
      </div>
    </article>
  );
}
