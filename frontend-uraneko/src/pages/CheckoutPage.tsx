import { useEffect, useState, type CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import { api, type Product } from '../lib/api';
import { useIsNarrow } from '../lib/useIsNarrow';
import { useAuth } from '../contexts/AuthContext';
import { getIdToken, beginGoogleLogin } from '../lib/auth';
import Ornament from '../components/bar/Ornament';
import SectionLabel from '../components/bar/SectionLabel';
import BarButton from '../components/bar/BarButton';
import BrassFrame from '../components/bar/BrassFrame';

const CURRENCIES = [
  { value: 'ltc', label: 'LTC · オススメ · 手数料 安' },
  { value: 'usdc', label: 'USDC · 手数料 低' },
  { value: 'usdttrc20', label: 'USDT (TRC20) · 手数料 低' },
  { value: 'btc', label: 'BTC オンチェーン · 手数料 高' },
  { value: '', label: '決済画面で選ぶ' },
];

// 支払い方法。暗号資産のみ実装済み。他は選択できるが準備中(選ぶと「次へ」が非活性)。
const PAY_METHODS = [
  { id: 'crypto', name: '暗号資産', sub: 'BTC / USDT / USDC / LTC 等', available: true },
  { id: 'card', name: 'クレジットカード', sub: 'Visa / Mastercard / JCB', available: false },
  { id: 'paypay', name: 'PayPay', sub: 'ペイペイ', available: false },
  { id: 'konbini', name: 'コンビニ払い', sub: 'セブン / ローソン / ファミマ', available: false },
] as const;
type PayMethodId = (typeof PAY_METHODS)[number]['id'];

// サーバのエラーコード → 利用者向けの日本語メッセージ
const ERROR_MESSAGES: Record<string, string> = {
  sold_out: '在庫なし。',
  coupon_invalid: '無効なコード。',
  coupon_expired: '期限切れのコード。',
  coupon_exhausted: 'このコードは使い切られている。',
  coupon_not_applicable: 'この作品には使えないコード。',
  amount_too_small: '割引後の金額が最低取引額を下回る。',
  invalid_amount: '金額が不正。やり直してください。',
  email_invalid: 'メールアドレスの形式が不正。',
  'email required': 'メールアドレスが必要。',
};
function friendlyError(msg: string): string {
  return ERROR_MESSAGES[msg] ?? msg;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// フォーム共通スタイル
const labelStyle: CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: 3,
  color: 'var(--muted)',
  marginBottom: 8,
};
const inputStyle: CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  background: 'transparent',
  border: '1px solid rgba(168,166,158,0.25)',
  color: 'var(--color-fg)',
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  letterSpacing: 1,
  outline: 'none',
};
const noteStyle: CSSProperties = {
  fontFamily: 'var(--font-serif-jp)',
  fontSize: 12,
  lineHeight: 1.9,
  letterSpacing: 1.5,
  color: 'var(--muted)',
  fontWeight: 300,
};

// ステッパー(01 アカウント / 02 支払い / 03 受け渡し)
function Stepper({ active }: { active: 1 | 2 | 3 }) {
  const steps = [
    { n: '01', label: 'アカウント' },
    { n: '02', label: '支払い' },
    { n: '03', label: '受け渡し' },
  ];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'clamp(10px, 3vw, 28px)',
        marginBottom: 48,
      }}
    >
      {steps.map((s, i) => {
        const index = i + 1;
        const isActive = index === active;
        const isDone = index < active;
        return (
          <div
            key={s.n}
            style={{ display: 'flex', alignItems: 'center', gap: 'clamp(8px, 2vw, 14px)' }}
          >
            <div
              style={{
                width: 'clamp(34px, 8vw, 44px)',
                height: 'clamp(34px, 8vw, 44px)',
                border: '1px solid var(--color-gold)',
                background: isActive ? 'var(--color-gold-bright)' : 'transparent',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: 2,
                  color: isActive
                    ? '#0a0a0b'
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
              <div
                style={{
                  width: 'clamp(14px, 4vw, 40px)',
                  height: 1,
                  background: 'rgba(168,166,158,0.3)',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface AppliedCoupon {
  code: string;
  percent: number;
  finalPrice: number;
}

export default function CheckoutPage() {
  const { id } = useParams<{ id: string }>();
  const isNarrow = useIsNarrow();
  const { user, loading: authLoading } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // ステージ: 01 アカウント → 02 支払い
  const [stage, setStage] = useState<'account' | 'payment'>('account');
  const [guestConfirmed, setGuestConfirmed] = useState(false);
  const [email, setEmail] = useState('');
  const [emailErr, setEmailErr] = useState<string | null>(null);

  // LTC をデフォルト(手数料が安く単一ネットワークで送金事故が少ないため初心者に安全)
  const [currency, setCurrency] = useState('ltc');
  const [payMethod, setPayMethod] = useState<PayMethodId>('crypto');
  const [coupon, setCoupon] = useState('');
  const [applied, setApplied] = useState<AppliedCoupon | null>(null);
  const [couponErr, setCouponErr] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getProduct(id).then(setProduct).catch((e) => setLoadErr(e.message));
  }, [id]);

  // ログイン済みなら会員選択を飛ばす。途中でサインアウトしたら会員選択に戻す。
  useEffect(() => {
    if (user) setStage('payment');
    else if (!guestConfirmed) setStage('account');
  }, [user, guestConfirmed]);

  // 別ドメインの決済ページへ遷移後にブラウザバックすると、bfcache(戻る/進むキャッシュ)が
  // submitting=true のままページを復元し、ボタンが「処理中」で固まる。bfcache 復帰
  // (persisted=true)を検知してボタン状態を戻す。
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setSubmitting(false);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const originalPrice = product?.price_jpy ?? 0;
  const finalPrice = applied ? applied.finalPrice : originalPrice;
  const discount = originalPrice - finalPrice;
  const isFree = applied !== null && finalPrice === 0;
  const soldOut = product?.available === false;
  const selMethod = PAY_METHODS.find((m) => m.id === payMethod)!;
  // 未実装の支払い方法を選んでいる間は購入不可(無料購入は方法不問)
  const methodBlocked = !isFree && payMethod !== 'crypto';

  function proceedAsGuest() {
    if (!EMAIL_RE.test(email)) {
      setEmailErr('メールアドレスの形式が不正。');
      return;
    }
    setEmailErr(null);
    setGuestConfirmed(true);
    setStage('payment');
  }

  function backToAccount() {
    setGuestConfirmed(false);
    setStage('account');
  }

  async function applyCoupon() {
    if (!product) return;
    const code = coupon.trim();
    if (!code) {
      setCouponErr('コードを入力。');
      return;
    }
    setApplying(true);
    setCouponErr(null);
    try {
      const r = await api.validateCoupon({ product_id: product.product_id, coupon_code: code });
      if (r.valid && r.final_price_jpy != null && r.discount_percent != null) {
        setApplied({ code, percent: r.discount_percent, finalPrice: r.final_price_jpy });
      } else {
        setApplied(null);
        setCouponErr(friendlyError(r.reason ?? 'coupon_invalid'));
      }
    } catch {
      setApplied(null);
      setCouponErr('確認に失敗。時間をおいて再試行。');
    } finally {
      setApplying(false);
    }
  }

  function clearCoupon() {
    setApplied(null);
    setCoupon('');
    setCouponErr(null);
  }

  async function submit() {
    if (!product) return;
    if (methodBlocked) return; // 準備中の支払い方法では進めない
    setErr(null);
    // 未適用のまま入力されたコードは、適用して金額を確認してから購入してもらう
    if (coupon.trim() && !applied) {
      setErr('コードは「適用」で確認してから進む。');
      return;
    }
    setSubmitting(true);
    try {
      let idToken: string | null = null;
      let buyerEmail: string | undefined;
      if (user) {
        idToken = await getIdToken();
        if (!idToken) {
          setErr('セッション切れ。ログインし直してください。');
          setSubmitting(false);
          return;
        }
      } else {
        buyerEmail = email;
      }
      const res = await api.checkout(
        {
          product_id: product.product_id,
          email: buyerEmail,
          pay_currency: isFree ? undefined : currency || undefined,
          coupon_code: applied?.code,
        },
        idToken,
      );
      if (res.free && res.complete_url) {
        // 100%割引: 決済不要。受領ページ(署名トークン付き)へ直接遷移
        window.location.href = res.complete_url;
      } else if (res.invoice_url) {
        window.location.href = res.invoice_url;
      } else {
        setErr('決済URLの取得に失敗。時間をおいて再試行。');
        setSubmitting(false);
      }
    } catch (e) {
      setErr(friendlyError((e as Error).message));
      setSubmitting(false);
    }
  }

  if (loadErr && !product)
    return (
      <p style={{ color: '#e66', fontFamily: 'var(--font-serif-jp)' }}>エラー: {loadErr}</p>
    );
  if (!product || authLoading)
    return (
      <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-serif-jp)' }}>
        読み込み中...
      </p>
    );

  // ---- 01 会員選択 ----
  if (stage === 'account') {
    return (
      <div>
        <Stepper active={1} />
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <div
            style={{
              textAlign: 'center',
              marginBottom: 32,
              fontFamily: 'var(--font-serif-jp)',
              fontSize: 14,
              letterSpacing: 2,
              color: 'var(--muted)',
              fontWeight: 300,
            }}
          >
            {product.title} — ¥ {product.price_jpy.toLocaleString()}
          </div>

          <SectionLabel style={{ marginBottom: 14 }}>— ACCOUNT · 購入方法</SectionLabel>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
              gap: 24,
            }}
          >
            <BrassFrame padding="28px 28px">
              <div
                style={{
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 16,
                  fontWeight: 300,
                  letterSpacing: 3,
                  color: 'var(--color-fg)',
                  marginBottom: 10,
                }}
              >
                ログインして購入
              </div>
              <div style={{ ...noteStyle, marginBottom: 20 }}>
                Google アカウントでログイン。
                <br />
                購入記録が残り、リンクをいつでも再取得できる。
              </div>
              <BarButton
                onClick={() => void beginGoogleLogin(`/checkout/${id}`)}
                style={{ width: '100%' }}
              >
                SIGN IN · Google でログイン
              </BarButton>
            </BrassFrame>

            <BrassFrame padding="28px 28px">
              <div
                style={{
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 16,
                  fontWeight: 300,
                  letterSpacing: 3,
                  color: 'var(--color-fg)',
                  marginBottom: 10,
                }}
              >
                ログインせずに購入
              </div>
              <div style={{ ...noteStyle, marginBottom: 20 }}>
                記録は残らない。
                <br />
                リンクは入力したアドレスに送る。
              </div>
              <label style={labelStyle}>EMAIL · 送信先</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
              />
              {emailErr && (
                <p
                  style={{
                    marginTop: 8,
                    fontFamily: 'var(--font-serif-jp)',
                    fontSize: 12,
                    color: '#e66',
                  }}
                >
                  {emailErr}
                </p>
              )}
              <BarButton onClick={proceedAsGuest} style={{ width: '100%', marginTop: 16 }}>
                このアドレスで進む
              </BarButton>
            </BrassFrame>
          </div>
        </div>
      </div>
    );
  }

  // ---- 02 支払い ----
  return (
    <div>
      <Stepper active={2} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isNarrow ? '1fr' : '1fr 420px',
          gap: isNarrow ? 36 : 56,
        }}
      >
        {/* 左:購入者 → クーポン → 支払い方法 */}
        <div>
          {/* 購入者 */}
          <SectionLabel style={{ marginBottom: 14 }}>— BUYER · 購入者</SectionLabel>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 16,
              padding: '14px 16px',
              border: '1px solid rgba(168,166,158,0.25)',
              marginBottom: 28,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                letterSpacing: 1,
                color: 'var(--color-fg)',
                overflowWrap: 'anywhere',
              }}
            >
              {user ? user.email : email}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-serif-jp)',
                fontSize: 10,
                letterSpacing: 1.5,
                color: 'var(--dim)',
                whiteSpace: 'nowrap',
              }}
            >
              {user ? '会員 · 記録あり' : 'ゲスト · 記録なし'}
              {!user && (
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    backToAccount();
                  }}
                  style={{ marginLeft: 10, color: 'var(--color-gold)', textDecoration: 'underline' }}
                >
                  変更
                </a>
              )}
            </span>
          </div>

          {/* クーポン */}
          <SectionLabel style={{ marginBottom: 14 }}>— COUPON · コード</SectionLabel>
          <BrassFrame padding="22px 24px" style={{ marginBottom: 28 }}>
            <label style={labelStyle}>CODE · 所持者のみ</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                type="text"
                value={coupon}
                onChange={(e) => {
                  setCoupon(e.target.value);
                  setCouponErr(null);
                  if (applied) setApplied(null); // コードを書き換えたら適用は解除
                }}
                placeholder="任意"
                disabled={applying}
                style={{ ...inputStyle, flex: 1, minWidth: 0 }}
              />
              <button
                onClick={() => void applyCoupon()}
                disabled={applying || !coupon.trim() || applied !== null}
                style={{
                  padding: '12px 22px',
                  background: applied ? 'rgba(168,166,158,0.15)' : 'transparent',
                  border: '1px solid rgba(168,166,158,0.6)',
                  color: 'var(--color-gold-bright)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: 3,
                  cursor: applying || !coupon.trim() || applied !== null ? 'default' : 'pointer',
                  opacity: !coupon.trim() && !applied ? 0.5 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {applying ? '確認中...' : applied ? '適用済' : '適用'}
              </button>
            </div>
            {couponErr && (
              <p
                style={{
                  marginTop: 10,
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 12,
                  color: '#e66',
                }}
              >
                {couponErr}
              </p>
            )}
            {applied && (
              <div
                style={{
                  marginTop: 12,
                  padding: '10px 14px',
                  border: '1px solid rgba(184,181,172,0.4)',
                  background: 'rgba(184,181,172,0.07)',
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 12,
                  letterSpacing: 1.5,
                  color: 'var(--color-gold-bright)',
                }}
              >
                {applied.percent}% OFF 適用 · −¥ {discount.toLocaleString()}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    clearCoupon();
                  }}
                  style={{ marginLeft: 12, color: 'var(--muted)', textDecoration: 'underline' }}
                >
                  解除
                </a>
              </div>
            )}
          </BrassFrame>

          {/* 支払い方法(無料なら不要) */}
          <SectionLabel style={{ marginBottom: 14 }}>— PAYMENT · 支払い方法</SectionLabel>
          {isFree ? (
            <BrassFrame padding="24px 28px" style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 14,
                  fontWeight: 300,
                  letterSpacing: 2,
                  lineHeight: 2,
                  color: 'var(--color-fg)',
                }}
              >
                支払いは発生しない。
                <br />
                「取引を完了する」でダウンロードリンクをメールに送る。
              </div>
            </BrassFrame>
          ) : (
            <>
              {/* 支払い方法の選択。暗号資産がデフォルト。他も選べるが準備中で購入不可。 */}
              <div role="radiogroup" aria-label="支払い方法" style={{ marginBottom: 16 }}>
                {PAY_METHODS.map((m) => {
                  const selected = payMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setPayMethod(m.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '14px 16px',
                        marginBottom: 8,
                        background: selected ? 'rgba(184,181,172,0.06)' : 'transparent',
                        border: `1px solid ${
                          selected ? 'var(--color-gold)' : 'rgba(168,166,158,0.2)'
                        }`,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span
                        style={{
                          width: 15,
                          height: 15,
                          flexShrink: 0,
                          borderRadius: '50%',
                          border: `1px solid ${
                            selected ? 'var(--color-gold-bright)' : 'rgba(168,166,158,0.5)'
                          }`,
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        {selected && (
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              background: 'var(--color-gold-bright)',
                            }}
                          />
                        )}
                      </span>
                      <span
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 3,
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-serif-jp)',
                            fontSize: 15,
                            letterSpacing: 2,
                            color: m.available ? 'var(--color-fg)' : 'var(--muted)',
                          }}
                        >
                          {m.name}
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 9,
                            letterSpacing: 1,
                            color: 'var(--dim)',
                          }}
                        >
                          {m.sub}
                        </span>
                      </span>
                      {!m.available && (
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 9,
                            letterSpacing: 3,
                            padding: '3px 9px',
                            color: 'var(--dim)',
                            border: '1px solid rgba(168,166,158,0.25)',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          準備中
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 選択中の方法の詳細 */}
              {payMethod === 'crypto' ? (
                <BrassFrame padding="28px 32px" style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      letterSpacing: 2,
                      color: 'var(--muted)',
                      marginBottom: 20,
                    }}
                  >
                    via nowpayments · btc / lightning / usdt / usdc / ltc
                  </div>

                  <div style={{ marginBottom: 4 }}>
                    <label style={labelStyle}>CURRENCY · 支払い通貨</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      style={{ ...inputStyle, fontFamily: 'var(--font-serif-jp)', appearance: 'none' }}
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
                      border: '1px solid rgba(168,166,158,0.25)',
                      background: 'rgba(168,166,158,0.05)',
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
                    <div style={{ ...noteStyle, marginBottom: 10 }}>送金手数料は通貨で変わる。目安:</div>

                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        lineHeight: 2,
                        color: 'var(--color-fg)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>LTC</span>
                        <span style={{ color: 'var(--color-gold-bright)' }}>約 ¥30 ◎</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>USDC</span>
                        <span style={{ color: 'var(--color-gold-bright)' }}>約 ¥10 ◎</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>USDT (TRC20)</span>
                        <span style={{ color: 'var(--color-gold-bright)' }}>約 ¥150 ◎</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
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
                      おすすめウォレットは <strong style={{ color: 'var(--muted)' }}>Trust Wallet</strong>(スマホ用・無料)。
                      決済ページのQRを送金画面で読み取ると、送金先と金額が自動で入ります。
                    </div>
                  </div>
                </BrassFrame>
              ) : (
                <BrassFrame padding="24px 28px" style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-serif-jp)',
                      fontSize: 14,
                      fontWeight: 300,
                      letterSpacing: 1.5,
                      lineHeight: 1.9,
                      color: 'var(--color-fg)',
                    }}
                  >
                    「{selMethod.name}」は準備中です。
                    <br />
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                      現在ご購入いただけるのは
                      <strong style={{ color: 'var(--color-gold-bright)' }}>暗号資産</strong>
                      のみです。上の「暗号資産」を選んでお進みください。
                    </span>
                  </div>
                </BrassFrame>
              )}
            </>
          )}

          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: 2,
              color: 'var(--dim)',
              lineHeight: 1.8,
            }}
          >
            ※ デジタル商品につき、購入完了後・ダウンロード後の返品/返金はできません。
            <br />
            <a href="/legal/tokushoho" target="_blank" rel="noopener" style={{ color: 'var(--muted)' }}>
              特定商取引法に基づく表記
            </a>
            {' · '}
            <a href="/legal/terms" target="_blank" rel="noopener" style={{ color: 'var(--muted)' }}>
              利用規約
            </a>
          </p>
        </div>

        {/* 右:明細 */}
        <div>
          <SectionLabel style={{ marginBottom: 14 }}>— ORDER · 明細</SectionLabel>
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
              <span>¥ {originalPrice.toLocaleString()}</span>
            </div>

            {applied && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: 2,
                  color: 'var(--color-gold-bright)',
                  marginBottom: 8,
                }}
              >
                <span>COUPON {applied.percent}% OFF</span>
                <span>−¥ {discount.toLocaleString()}</span>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                paddingTop: 18,
                borderTop: '1px solid rgba(168,166,158,0.3)',
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
              <span style={{ textAlign: 'right' }}>
                {applied && (
                  <span
                    style={{
                      display: 'block',
                      fontFamily: 'var(--font-serif-jp)',
                      fontSize: 14,
                      letterSpacing: 2,
                      color: 'var(--dim)',
                      textDecoration: 'line-through',
                    }}
                  >
                    ¥ {originalPrice.toLocaleString()}
                  </span>
                )}
                <span
                  style={{
                    fontFamily: 'var(--font-serif-jp)',
                    fontSize: 28,
                    fontWeight: 300,
                    letterSpacing: 3,
                    color: 'var(--color-gold-bright)',
                  }}
                >
                  ¥ {finalPrice.toLocaleString()}
                </span>
              </span>
            </div>

            {soldOut && (
              <p
                style={{
                  marginTop: 16,
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 12,
                  color: '#e66',
                }}
              >
                {ERROR_MESSAGES.sold_out}
              </p>
            )}
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
                disabled={submitting || soldOut || methodBlocked}
                size="lg"
                style={{
                  width: '100%',
                  opacity: submitting || soldOut || methodBlocked ? 0.5 : 1,
                }}
              >
                {submitting
                  ? '処理中……'
                  : isFree
                  ? 'COMPLETE · 取引を完了する'
                  : methodBlocked
                  ? '準備中 · 選べません'
                  : 'PROCEED · 送金へ進む'}
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
