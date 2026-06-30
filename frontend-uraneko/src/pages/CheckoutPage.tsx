import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, type Product } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { getIdToken, getGoogleLoginUrl } from '../lib/auth';
import Ornament from '../components/bar/Ornament';
import SectionLabel from '../components/bar/SectionLabel';
import BarButton from '../components/bar/BarButton';
import BrassFrame from '../components/bar/BrassFrame';

const CURRENCIES = [
  { value: '', label: 'NOWPayments の画面で選ぶ(おすすめ)' },
  { value: 'usdttrc20', label: 'USDT (TRC20)・手数料が安い' },
  { value: 'usdc', label: 'USDC・手数料が安い' },
  { value: 'ltc', label: 'LTC・手数料が安い' },
  { value: 'btc', label: 'BTC オンチェーン・手数料が高め' },
];

// ステッパー(01 会員選択 / 02 お支払い / 03 受領)
function Stepper({ active }: { active: 1 | 2 | 3 }) {
  const steps = [
    { n: '01', label: '会員' },
    { n: '02', label: 'お支払い' },
    { n: '03', label: '受領' },
  ];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        marginBottom: 48,
      }}
    >
      {steps.map((s, i) => {
        const index = i + 1;
        const isActive = index === active;
        const isDone = index < active;
        return (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                transform: 'rotate(45deg)',
                border: '1px solid var(--color-gold)',
                background: isActive ? 'var(--color-gold)' : 'transparent',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <div
                style={{
                  transform: 'rotate(-45deg)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: 2,
                  color: isActive
                    ? '#120808'
                    : isDone
                    ? 'var(--color-gold)'
                    : 'var(--dim)',
                }}
              >
                {isDone ? '✓' : s.n}
              </div>
            </div>
            <div
              style={{
                fontFamily: 'var(--font-serif-jp)',
                fontSize: 12,
                letterSpacing: 3,
                color: isActive
                  ? 'var(--color-fg)'
                  : isDone
                  ? 'var(--muted)'
                  : 'var(--dim)',
              }}
            >
              {s.label}
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: 40, height: 1, background: 'rgba(201,169,97,0.3)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

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
          setErr('メールアドレスの形式が正しくありません');
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

  if (err && !product)
    return (
      <p style={{ color: '#e66', fontFamily: 'var(--font-serif-jp)' }}>エラー: {err}</p>
    );
  if (!product)
    return (
      <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-serif-jp)' }}>
        読み込み中...
      </p>
    );

  return (
    <div>
      <Stepper active={2} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 420px',
          gap: 56,
        }}
      >
        {/* 左:支払い方法 */}
        <div>
          <SectionLabel style={{ marginBottom: 14 }}>— お支払い方法 · METHOD</SectionLabel>

          <BrassFrame padding="28px 32px" style={{ marginBottom: 20 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 18,
                  fontWeight: 300,
                  letterSpacing: 3,
                  color: 'var(--color-fg)',
                }}
              >
                暗号資産 · Cryptocurrency
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  letterSpacing: 3,
                  padding: '3px 9px',
                  color: 'var(--color-gold-bright)',
                  border: '1px solid rgba(201,169,97,0.6)',
                }}
              >
                SELECTED
              </div>
            </div>
            <div
              style={{
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                fontSize: 12,
                letterSpacing: 2,
                color: 'var(--muted)',
                marginBottom: 20,
              }}
            >
              Paid via NOWPayments · BTC / Lightning / USDT / USDC / LTC
            </div>

            {/* 会員/ゲスト切替 */}
            <div
              style={{
                display: 'flex',
                border: '1px solid rgba(201,169,97,0.25)',
                marginBottom: 20,
              }}
            >
              <button
                onClick={() => setMode('login')}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: mode === 'login' ? 'rgba(201,169,97,0.15)' : 'transparent',
                  border: 'none',
                  color: mode === 'login' ? 'var(--color-gold-bright)' : 'var(--muted)',
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 12,
                  letterSpacing: 3,
                  cursor: 'pointer',
                }}
              >
                会員として購入
              </button>
              <button
                onClick={() => setMode('guest')}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: mode === 'guest' ? 'rgba(201,169,97,0.15)' : 'transparent',
                  border: 'none',
                  color: mode === 'guest' ? 'var(--color-gold-bright)' : 'var(--muted)',
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 12,
                  letterSpacing: 3,
                  cursor: 'pointer',
                }}
              >
                非会員として購入
              </button>
            </div>

            {mode === 'login' && !user && (
              <div
                style={{
                  padding: 14,
                  marginBottom: 18,
                  border: '1px solid rgba(230,200,119,0.3)',
                  background: 'rgba(230,200,119,0.05)',
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 12,
                  letterSpacing: 1.5,
                  color: 'var(--muted)',
                }}
              >
                ログインしていません。
                <a
                  href={getGoogleLoginUrl()}
                  style={{ marginLeft: 10, color: 'var(--color-gold)', textDecoration: 'underline' }}
                >
                  SIGN IN
                </a>
              </div>
            )}

            {mode === 'guest' && (
              <div style={{ marginBottom: 18 }}>
                <label
                  style={{
                    display: 'block',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: 3,
                    color: 'var(--muted)',
                    marginBottom: 8,
                  }}
                >
                  EMAIL · ダウンロードURLの送信先
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: 'transparent',
                    border: '1px solid rgba(201,169,97,0.25)',
                    color: 'var(--color-fg)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    letterSpacing: 1,
                    outline: 'none',
                  }}
                />
              </div>
            )}

            <div style={{ marginBottom: 4 }}>
              <label
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: 3,
                  color: 'var(--muted)',
                  marginBottom: 8,
                }}
              >
                CURRENCY · 支払い通貨
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: 'transparent',
                  border: '1px solid rgba(201,169,97,0.25)',
                  color: 'var(--color-fg)',
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 13,
                  letterSpacing: 1,
                  outline: 'none',
                  appearance: 'none',
                }}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value} style={{ background: 'var(--color-panel)' }}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 送金手数料の目安(初心者向けヘルプ) */}
            <div
              style={{
                marginTop: 18,
                padding: '14px 16px',
                border: '1px solid rgba(201,169,97,0.25)',
                background: 'rgba(201,169,97,0.05)',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: 3,
                  color: 'var(--color-gold)',
                  marginBottom: 10,
                }}
              >
                — 送金手数料の目安 —
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 12,
                  lineHeight: 1.9,
                  color: 'var(--muted)',
                  fontWeight: 300,
                  marginBottom: 10,
                }}
              >
                通貨によって、お客様が払う送金手数料が変わります。
                <br />
                安く済ませたい方は下の表をご参考にどうぞ。
              </div>

              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  lineHeight: 2,
                  color: 'var(--color-fg)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>USDT (TRC20)</span>
                  <span style={{ color: 'var(--color-gold-bright)' }}>約 ¥150 ◎</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>USDC</span>
                  <span style={{ color: 'var(--color-gold-bright)' }}>約 ¥10 ◎</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>LTC</span>
                  <span>約 ¥30</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e6a060' }}>
                  <span>BTC オンチェーン</span>
                  <span>約 ¥5,000 ⚠</span>
                </div>
              </div>

              <div
                style={{
                  marginTop: 12,
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 11,
                  lineHeight: 1.7,
                  color: 'var(--dim)',
                  fontWeight: 300,
                }}
              >
                BTC で送る場合、<strong style={{ color: 'var(--muted)' }}>GMO コイン・DMM Bitcoin・SBI VC トレード</strong>
                からなら送金が無料です。<strong style={{ color: 'var(--muted)' }}>bitFlyer・Coincheck</strong>
                からだと約 ¥5,000 かかってしまうのでご注意ください。
              </div>
            </div>
          </BrassFrame>

          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: 2,
              color: 'var(--dim)',
              lineHeight: 1.8,
            }}
          >
            ※ クレジットカード決済は取扱いございません。
            <br />※ お支払い完了後、ご登録のメールに専用ダウンロードURLをお送りします。
          </p>
        </div>

        {/* 右:明細 */}
        <div>
          <SectionLabel style={{ marginBottom: 14 }}>— 御明細 · ORDER</SectionLabel>
          <BrassFrame padding="28px 28px">
            <div style={{ marginBottom: 18 }}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: 3,
                  color: 'var(--color-gold)',
                  marginBottom: 4,
                }}
              >
                № {product.product_id}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 16,
                  fontWeight: 300,
                  letterSpacing: 2,
                  color: 'var(--color-fg)',
                  lineHeight: 1.4,
                }}
              >
                {product.title}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: 2,
                  color: 'var(--muted)',
                  marginTop: 6,
                }}
              >
                {Math.floor(product.duration_sec / 60)} min
              </div>
            </div>

            <Ornament style={{ margin: '18px 0' }} />

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: 2,
                color: 'var(--muted)',
                marginBottom: 8,
              }}
            >
              <span>SUBTOTAL</span>
              <span>¥ {product.price_jpy.toLocaleString()}</span>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                paddingTop: 18,
                borderTop: '1px solid rgba(201,169,97,0.3)',
                marginTop: 18,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: 4,
                  color: 'var(--color-gold)',
                }}
              >
                TOTAL
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 28,
                  fontWeight: 300,
                  letterSpacing: 3,
                  color: 'var(--color-gold-bright)',
                }}
              >
                ¥ {product.price_jpy.toLocaleString()}
              </span>
            </div>

            {err && (
              <p
                style={{
                  marginTop: 16,
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 12,
                  color: '#e66',
                }}
              >
                {err}
              </p>
            )}

            <div style={{ marginTop: 24 }}>
              <BarButton
                onClick={submit}
                disabled={submitting || (mode === 'login' && !user)}
                size="lg"
                style={{
                  width: '100%',
                  opacity: submitting || (mode === 'login' && !user) ? 0.5 : 1,
                }}
              >
                {submitting ? '処理中...' : 'PROCEED · 送金へ進む'}
              </BarButton>
            </div>

            <div
              style={{
                marginTop: 14,
                textAlign: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                letterSpacing: 3,
                color: 'var(--dim)',
              }}
            >
              SSL · TLS 1.3 · SECURE
            </div>
          </BrassFrame>
        </div>
      </div>
    </div>
  );
}
