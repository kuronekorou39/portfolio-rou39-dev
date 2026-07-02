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
  { value: '', label: 'NOWPayments の画面で選ぶ(おすすめ)' },
  { value: 'usdttrc20', label: 'USDT (TRC20)・手数料が安い' },
  { value: 'usdc', label: 'USDC・手数料が安い' },
  { value: 'ltc', label: 'LTC・手数料が安い' },
  { value: 'btc', label: 'BTC オンチェーン・手数料が高め' },
];

// サーバのエラーコード → 利用者向けの日本語メッセージ
const ERROR_MESSAGES: Record<string, string> = {
  sold_out: '申し訳ございません。ただ今この作品は在庫切れです。',
  coupon_invalid: 'クーポンコードが無効です。',
  coupon_expired: 'このクーポンは有効期限が切れています。',
  coupon_exhausted: 'このクーポンは利用上限に達しました。',
  coupon_not_applicable: 'このクーポンはこの作品には使えません。',
  amount_too_small: '割引後の金額が最低取引額を下回るため決済できません。',
  invalid_amount: '金額が不正です。もう一度お試しください。',
  email_invalid: 'メールアドレスの形式が正しくありません。',
  'email required': 'メールアドレスを入力してください。',
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
  border: '1px solid rgba(201,169,97,0.25)',
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
              <div
                style={{
                  width: 'clamp(14px, 4vw, 40px)',
                  height: 1,
                  background: 'rgba(201,169,97,0.3)',
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

  // ステージ: 01 会員選択 → 02 お支払い
  const [stage, setStage] = useState<'account' | 'payment'>('account');
  const [guestConfirmed, setGuestConfirmed] = useState(false);
  const [email, setEmail] = useState('');
  const [emailErr, setEmailErr] = useState<string | null>(null);

  const [currency, setCurrency] = useState('');
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

  const originalPrice = product?.price_jpy ?? 0;
  const finalPrice = applied ? applied.finalPrice : originalPrice;
  const discount = originalPrice - finalPrice;
  const isFree = applied !== null && finalPrice === 0;
  const soldOut = product?.available === false;

  function proceedAsGuest() {
    if (!EMAIL_RE.test(email)) {
      setEmailErr('メールアドレスの形式が正しくありません');
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
      setCouponErr('クーポンコードを入力してください');
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
      setCouponErr('クーポンの確認に失敗しました。時間をおいて再度お試しください。');
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
    setErr(null);
    // 未適用のまま入力されたコードは、適用して金額を確認してから購入してもらう
    if (coupon.trim() && !applied) {
      setErr('クーポンコードは「適用」ボタンで確認してから購入にお進みください。');
      return;
    }
    setSubmitting(true);
    try {
      let idToken: string | null = null;
      let buyerEmail: string | undefined;
      if (user) {
        idToken = await getIdToken();
        if (!idToken) {
          setErr('ログインの有効期限が切れました。もう一度ログインしてください。');
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
        setErr('決済URLの取得に失敗しました。時間をおいて再度お試しください。');
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

          <SectionLabel style={{ marginBottom: 14 }}>— ご購入方法の選択 · ACCOUNT</SectionLabel>
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
                Google アカウントでログインします。
                <br />
                購入履歴がマイページに残り、ダウンロードURLをいつでも確認できます。
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
                購入履歴は残りません。
                <br />
                ダウンロードURLは、ご入力のメールアドレスにお送りします。
              </div>
              <label style={labelStyle}>EMAIL · ダウンロードURLの送信先</label>
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
                このメールアドレスで進む
              </BarButton>
            </BrassFrame>
          </div>
        </div>
      </div>
    );
  }

  // ---- 02 お支払い ----
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
        {/* 左:購入者 → クーポン → お支払い方法 */}
        <div>
          {/* 購入者 */}
          <SectionLabel style={{ marginBottom: 14 }}>— ご購入者 · ACCOUNT</SectionLabel>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 16,
              padding: '14px 16px',
              border: '1px solid rgba(201,169,97,0.25)',
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
              {user ? '会員(購入履歴が残ります)' : 'ゲスト(履歴は残りません)'}
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
          <SectionLabel style={{ marginBottom: 14 }}>— クーポン · COUPON</SectionLabel>
          <BrassFrame padding="22px 24px" style={{ marginBottom: 28 }}>
            <label style={labelStyle}>COUPON · クーポンコード(お持ちの方)</label>
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
                  background: applied ? 'rgba(201,169,97,0.15)' : 'transparent',
                  border: '1px solid rgba(201,169,97,0.6)',
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
                  border: '1px solid rgba(230,200,119,0.4)',
                  background: 'rgba(230,200,119,0.07)',
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 12,
                  letterSpacing: 1.5,
                  color: 'var(--color-gold-bright)',
                }}
              >
                {applied.percent}% OFF を適用しました(−¥ {discount.toLocaleString()})
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

          {/* お支払い方法(無料なら不要) */}
          <SectionLabel style={{ marginBottom: 14 }}>— お支払い方法 · METHOD</SectionLabel>
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
                クーポンの適用により、お支払いは不要です。
                <br />
                「購入を完了する」を押すと、ダウンロードURLをメールでお送りします。
              </div>
            </BrassFrame>
          ) : (
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

              <div style={{ marginBottom: 4 }}>
                <label style={labelStyle}>CURRENCY · 支払い通貨</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{
                    ...inputStyle,
                    fontFamily: 'var(--font-serif-jp)',
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
                <div style={{ ...noteStyle, marginBottom: 10 }}>
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
                disabled={submitting || soldOut}
                size="lg"
                style={{
                  width: '100%',
                  opacity: submitting || soldOut ? 0.5 : 1,
                }}
              >
                {submitting
                  ? '処理中...'
                  : isFree
                  ? 'COMPLETE · 購入を完了する'
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
