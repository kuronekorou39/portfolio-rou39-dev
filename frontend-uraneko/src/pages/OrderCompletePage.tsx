import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, type OrderDetail } from '../lib/api';
import { getIdToken } from '../lib/auth';

export default function OrderCompletePage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const emailToken = params.get('token');

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const idToken = await getIdToken();
      try {
        const o = await api.getOrder(id, {
          token: emailToken ?? undefined,
          idToken,
        });
        setOrder(o);
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, [id, emailToken]);

  if (err) return <p className="text-red-400">エラー: {err}</p>;
  if (!order) return <p className="text-neutral-400">読み込み中...</p>;

  if (order.status !== 'paid') {
    return (
      <div className="mx-auto max-w-lg text-center">
        <h1 className="mb-4 text-2xl font-bold">決済確認中</h1>
        <p className="text-sm text-neutral-400">
          現在のステータス: <span className="font-mono">{order.status}</span>
        </p>
        <p className="mt-4 text-sm text-neutral-400">
          支払いが確認され次第、ダウンロードリンクが表示されます。
          <br />
          時間がかかる場合はこのページを再読み込みしてください。
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-2xl font-bold">ご購入ありがとうございます</h1>
      <p className="mb-6 text-sm text-neutral-400">
        注文番号: <span className="font-mono">{order.order_id}</span>
      </p>

      {order.download_url ? (
        <a
          href={order.download_url}
          className="inline-block rounded-md bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-neutral-200"
          download
        >
          動画をダウンロード
        </a>
      ) : (
        <p className="text-sm text-neutral-400">ダウンロードURLの発行に失敗しました。</p>
      )}

      <p className="mt-6 text-xs text-red-300">
        ※このURLはあなた専用です。他人との共有は絶対にしないでください(透かしによって特定されます)。
      </p>
      {order.download_url_expires_in && (
        <p className="mt-2 text-xs text-neutral-500">
          このダウンロードURLの有効期限は {Math.floor(order.download_url_expires_in / 60)} 分です。
        </p>
      )}
    </div>
  );
}
