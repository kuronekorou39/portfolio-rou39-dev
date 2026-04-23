import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type OrderSummary } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { getIdToken, getGoogleLoginUrl } from '../lib/auth';

export default function MyOrdersPage() {
  const { user, loading } = useAuth();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const idToken = await getIdToken();
      if (!idToken) return;
      try {
        setOrders(await api.myOrders(idToken));
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, [user]);

  if (loading) return <p className="text-neutral-400">読み込み中...</p>;

  if (!user) {
    return (
      <div className="mx-auto max-w-md text-center">
        <p className="mb-4 text-neutral-400">購入履歴を見るにはログインが必要です。</p>
        <a
          href={getGoogleLoginUrl()}
          className="inline-block rounded-md bg-white px-5 py-2 text-sm font-medium text-black"
        >
          ログイン
        </a>
      </div>
    );
  }

  if (err) return <p className="text-red-400">エラー: {err}</p>;
  if (!orders) return <p className="text-neutral-400">読み込み中...</p>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">購入履歴</h1>
      {orders.length === 0 ? (
        <p className="text-neutral-400">まだ購入がありません。</p>
      ) : (
        <ul className="divide-y divide-white/10 rounded-md border border-white/10 bg-neutral-900">
          {orders.map((o) => (
            <li key={o.order_id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{o.product_id}</p>
                  <p className="text-xs text-neutral-500">{new Date(o.created_at).toLocaleString('ja-JP')}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-neutral-400">{o.status}</p>
                  {o.status === 'paid' && (
                    <Link
                      to={`/order/${o.order_id}/complete`}
                      className="mt-1 inline-block text-xs text-white underline"
                    >
                      ダウンロード
                    </Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
