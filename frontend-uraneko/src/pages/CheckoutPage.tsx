import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, type Product } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { getIdToken, getGoogleLoginUrl } from '../lib/auth';

const CURRENCIES = [
  { value: '', label: '決済時に NOWPayments で選択' },
  { value: 'btc', label: 'BTC (Bitcoin)' },
  { value: 'btcln', label: 'BTC Lightning' },
  { value: 'usdttrc20', label: 'USDT (TRC20)' },
  { value: 'usdc', label: 'USDC' },
  { value: 'ltc', label: 'LTC' },
];

export default function CheckoutPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [mode, setMode] = useState<'login' | 'guest'>(user ? 'login' : 'guest');
  const [email, setEmail] = useState('');
  const [currency, setCurrency] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getProduct(id).then(setProduct).catch((e) => setErr(e.message));
  }, [id]);

  useEffect(() => {
    setMode(user ? 'login' : 'guest');
  }, [user]);

  async function submit() {
    if (!product) return;
    setErr(null);
    setSubmitting(true);
    try {
      let idToken: string | null = null;
      let buyerEmail: string | undefined;
      if (mode === 'login') {
        idToken = await getIdToken();
        if (!idToken) {
          setErr('ログインが必要です');
          setSubmitting(false);
          return;
        }
      } else {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setErr('メールアドレスが不正です');
          setSubmitting(false);
          return;
        }
        buyerEmail = email;
      }
      const res = await api.checkout(
        {
          product_id: product.product_id,
          email: buyerEmail,
          pay_currency: currency || undefined,
        },
        idToken,
      );
      window.location.href = res.invoice_url;
    } catch (e) {
      setErr((e as Error).message);
      setSubmitting(false);
    }
  }

  if (err && !product) return <p className="text-red-400">エラー: {err}</p>;
  if (!product) return <p className="text-neutral-400">読み込み中...</p>;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-2 text-2xl font-bold">購入手続き</h1>
      <p className="mb-6 text-sm text-neutral-400">
        {product.title} - ¥{product.price_jpy.toLocaleString()}
      </p>

      <div className="mb-6 flex gap-2 rounded-md border border-white/10 bg-neutral-900 p-1 text-sm">
        <button
          onClick={() => setMode('login')}
          className={`flex-1 rounded px-3 py-2 ${mode === 'login' ? 'bg-white text-black' : 'text-neutral-400'}`}
        >
          ログインして購入
        </button>
        <button
          onClick={() => setMode('guest')}
          className={`flex-1 rounded px-3 py-2 ${mode === 'guest' ? 'bg-white text-black' : 'text-neutral-400'}`}
        >
          ゲスト購入
        </button>
      </div>

      {mode === 'login' && !user && (
        <div className="mb-4 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm">
          ログインしていません。
          <a href={getGoogleLoginUrl()} className="ml-2 underline">
            Google でログイン
          </a>
        </div>
      )}

      {mode === 'guest' && (
        <div className="mb-4">
          <label className="mb-1 block text-xs text-neutral-400">
            メールアドレス(ダウンロードリンクの送信先)
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-white/10 bg-neutral-900 px-3 py-2 text-sm"
            placeholder="you@example.com"
          />
        </div>
      )}

      <div className="mb-6">
        <label className="mb-1 block text-xs text-neutral-400">支払い通貨</label>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="w-full rounded border border-white/10 bg-neutral-900 px-3 py-2 text-sm"
        >
          {CURRENCIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {err && <p className="mb-4 text-sm text-red-400">{err}</p>}

      <button
        onClick={submit}
        disabled={submitting || (mode === 'login' && !user)}
        className="w-full rounded-md bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
      >
        {submitting ? '処理中...' : 'NOWPayments で支払いに進む'}
      </button>
    </div>
  );
}
