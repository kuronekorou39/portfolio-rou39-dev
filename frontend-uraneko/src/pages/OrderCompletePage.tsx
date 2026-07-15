import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { api, type OrderDetail, type PaymentInfo } from '../lib/api';
import { fmtJst } from '../lib/format';
import { useIsNarrow } from '../lib/useIsNarrow';
import { getIdToken } from '../lib/auth';
import Ornament from '../components/bar/Ornament';
import SectionLabel from '../components/bar/SectionLabel';
import BarButton from '../components/bar/BarButton';
import BrassFrame from '../components/bar/BrassFrame';
import Loading from '../components/bar/Loading';

// ウォレットが送金先と金額を自動で読み取れるよう BIP21 URI を組み立てる。
function paymentUri(pay: PaymentInfo): string {
  const scheme = pay.currency === 'ltc' ? 'litecoin' : pay.currency === 'btc' ? 'bitcoin' : '';
  if (!scheme) return pay.address;
  return `${scheme}:${pay.address}?amount=${pay.amount}`;
}

export default function OrderCompletePage() {
  const { id } = useParams<{ id: string }>();
  const isNarrow = useIsNarrow();
  const [params] = useSearchParams();
  const emailToken = params.get('token');

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 送金先が来たら QR(BIP21)を生成。data URL なので外部リクエストは発生しない(CSP 準拠)。
  const payAddress = order?.pay?.address;
  useEffect(() => {
    const pay = order?.pay;
    if (!pay?.address) {
      setQrDataUrl(null);
      return;
    }
    let alive = true;
    QRCode.toDataURL(paymentUri(pay), { margin: 1, width: 220 })
      .then((url) => {
        if (alive) setQrDataUrl(url);
      })
      .catch(() => {
        if (alive) setQrDataUrl(null);
      });
    return () => {
      alive = false;
    };
    // アドレスが変わったときだけ作り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payAddress]);

  async function copyAddress() {
    if (!order?.pay?.address) return;
    try {
      await navigator.clipboard.writeText(order.pay.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard 不可環境は無視(手動選択でコピー可) */
    }
  }

  // 暗号決済の確定は IPN 経由で非同期。決済が進むまで定期的に再取得し、受け渡し可能に
  // なったら自動でダウンロードを出す(手動更新不要)。
  // - BTC は反映が遅い(30分超もある)ので打ち切りは長め(90分)。
  // - expired/failed も「遅延入金で自動復旧」しうるので回し続ける(paid/cancelled のみ停止)。
  // - スマホでウォレットへ切替→戻った時に素早く反映するよう、可視化時に即再取得する。
  useEffect(() => {
    if (!id) return;
    const POLL_INTERVAL_MS = 8000;
    const POLL_MAX_MS = 90 * 60 * 1000;
    const STOP = new Set(['paid', 'cancelled']); // これ以外は遅延入金で変わりうるので回し続ける
    const startedAt = Date.now();
    let stopped = false;
    let got = false; // 一度でも取得成功したか(初回失敗のみエラー表示)
    let lastStatus = '';
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (stopped || STOP.has(lastStatus) || Date.now() - startedAt >= POLL_MAX_MS) return;
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    const poll = async () => {
      const idToken = await getIdToken();
      try {
        const o = await api.getOrder(id, { token: emailToken ?? undefined, idToken });
        if (stopped) return;
        got = true;
        lastStatus = o.status;
        setOrder(o);
        schedule();
      } catch (e) {
        if (stopped) return;
        if (!got) setErr((e as Error).message); // 初回だけエラー画面。以降の一時断は黙って再試行
        schedule();
      }
    };

    // タブ復帰(ウォレットから戻る等)で即座に再取得
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || stopped) return;
      if (STOP.has(lastStatus) || Date.now() - startedAt >= POLL_MAX_MS) return;
      if (timer) clearTimeout(timer);
      void poll();
    };

    void poll();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [id, emailToken]);

  if (err)
    return <p style={{ color: '#e66', fontFamily: 'var(--font-serif-jp)' }}>エラー: {err}</p>;
  if (!order) return <Loading />;

  const paid = order.status === 'paid';
  const confirming = order.status === 'confirming';
  // 入金検知(confirming)または確定(paid)で受け渡し可能。confirming はまだ最終確認前。
  const deliverable = (paid || confirming) && !!order.download_url;
  const underpaid = order.status === 'underpaid';
  const failed =
    order.status === 'failed' || order.status === 'expired' || order.status === 'cancelled';
  // 支払い待ち + 送金情報あり → 自前決済 UI(QR/送金先)を表示。
  const pay = order.pay ?? null;
  const awaitingPayment = !deliverable && !failed && !!pay?.address;
  // 状態が変わったときだけ左パネルをクロスフェードで入れ替える(ポーリング毎には再生しない)。
  const phase = deliverable ? 'delivered' : awaitingPayment ? 'pay' : failed ? 'failed' : 'wait';

  // 困ったとき用の問い合わせメール(注文番号・通貨をあらかじめ差し込む)。
  const helpMailto =
    'mailto:contact@rou39.com?subject=' +
    encodeURIComponent('uraneko 支払いについて') +
    '&body=' +
    encodeURIComponent(
      `注文番号: ${order.order_id}\n通貨: ${(pay?.currency ?? order.currency ?? '').toUpperCase()}\n\n(状況をお書きください。取引所の「送金済み」記録=txid があれば貼っていただけると早いです)`,
    );

  // 見出し・サブラベルを状態別に
  const label = paid
    ? 'DELIVERED'
    : confirming
    ? 'DELIVERED · CONFIRMING'
    : underpaid
    ? 'UNDERPAID'
    : failed
    ? order.status.toUpperCase()
    : 'AWAITING PAYMENT';
  const heading = paid
    ? '受け渡し完了'
    : confirming
    ? '受け渡し可能'
    : underpaid
    ? '支払額の不足'
    : order.status === 'cancelled'
    ? '取消済み'
    : order.status === 'expired'
    ? '受付時間の経過'
    : order.status === 'failed'
    ? '決済に失敗'
    : '送金待ち';
  const subline = paid
    ? 'your copy is ready.'
    : confirming
    ? 'payment detected — download now.'
    : underpaid
    ? 'amount received is insufficient.'
    : order.status === 'expired' || order.status === 'failed'
    ? "we'll deliver once your payment lands."
    : failed
    ? 'this order did not complete.'
    : 'waiting for your payment.';

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isNarrow ? '1fr' : '1fr 420px',
          gap: isNarrow ? 40 : 56,
        }}
      >
        {/* 左(状態が変わるとクロスフェードで入れ替わる) */}
        <div key={phase} className="anim-soft">
          <SectionLabel style={{ marginBottom: 18 }}>— {label}</SectionLabel>
          <h1
            style={{
              fontFamily: 'var(--font-serif-jp)',
              fontSize: 'clamp(32px, 9vw, 52px)',
              fontWeight: 200,
              letterSpacing: 6,
              lineHeight: 1.25,
              margin: 0,
              color: 'var(--color-fg)',
            }}
          >
            {heading}
          </h1>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              letterSpacing: 3,
              color: 'var(--muted)',
              marginTop: 14,
              fontWeight: 300,
            }}
          >
            {subline}
          </div>

          <Ornament style={{ margin: '36px 0', maxWidth: 320 }} />

          {deliverable && order.download_url && (
            <>
              <SectionLabel style={{ marginBottom: 14 }}>— FILE · 受け渡し</SectionLabel>
              <a
                href={order.download_url}
                download
                className="anim-glow"
                style={{ textDecoration: 'none', display: 'inline-block', borderRadius: 2 }}
              >
                <BarButton size="lg">↓ DOWNLOAD · 取得</BarButton>
              </a>
              {order.download_url_expires_in && (
                <p
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: 2,
                    color: 'var(--dim)',
                    marginTop: 14,
                    lineHeight: 1.8,
                  }}
                >
                  ※ このリンクは購入者専用。共有不可。
                  <br />※ 有効期限 {Math.floor(order.download_url_expires_in / 60)} 分。
                </p>
              )}
              {confirming && (
                <p
                  style={{
                    fontFamily: 'var(--font-serif-jp)',
                    fontSize: 12,
                    letterSpacing: 1,
                    color: 'var(--color-gold)',
                    marginTop: 18,
                    lineHeight: 1.9,
                    fontWeight: 300,
                  }}
                >
                  入金を確認しました。いますぐダウンロードいただけます。
                  <br />
                  ブロックチェーン上の最終確認が完了すると、ご登録のメールに控えの受け渡しリンクをお送りします(この画面を閉じても大丈夫です)。
                </p>
              )}
            </>
          )}

          {/* 自前決済 UI: 送金先アドレス・数量・QR。送金を検知すると上の受け渡し表示へ自動で切替わる */}
          {awaitingPayment && pay && (
            <>
              {underpaid && (
                <p
                  style={{
                    fontFamily: 'var(--font-serif-jp)',
                    fontSize: 12,
                    letterSpacing: 1,
                    color: 'var(--color-accent)',
                    marginBottom: 18,
                    lineHeight: 1.9,
                    fontWeight: 300,
                  }}
                >
                  お支払い額が不足しています。同じアドレスに不足分を送金いただくか、
                  こちらで確認のうえ個別にご連絡します。
                </p>
              )}
              <SectionLabel style={{ marginBottom: 14 }}>— PAYMENT · 送金</SectionLabel>
              <div
                style={{
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 15,
                  fontWeight: 300,
                  letterSpacing: 1,
                  color: 'var(--color-fg)',
                  marginBottom: 4,
                }}
              >
                {pay.currency.toUpperCase()} で ¥{order.price_jpy.toLocaleString()} を送金
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 22,
                  fontWeight: 300,
                  letterSpacing: 1,
                  color: 'var(--color-gold-bright)',
                  marginBottom: 18,
                }}
              >
                {pay.amount} {pay.currency.toUpperCase()}
              </div>

              {qrDataUrl && (
                <img
                  src={qrDataUrl}
                  alt="送金先 QR"
                  width={200}
                  height={200}
                  style={{
                    display: 'block',
                    background: '#fff',
                    padding: 10,
                    borderRadius: 4,
                    marginBottom: 16,
                  }}
                />
              )}

              <label
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  letterSpacing: 3,
                  color: 'var(--color-gold)',
                }}
              >
                送金先アドレス（{(pay.network ?? pay.currency).toUpperCase()} ネットワーク）
              </label>
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'stretch',
                  marginTop: 8,
                  flexWrap: 'wrap',
                }}
              >
                <code
                  style={{
                    flex: '1 1 240px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: 'var(--color-fg)',
                    background: 'rgba(168,166,158,0.08)',
                    border: '1px solid rgba(168,166,158,0.25)',
                    padding: '10px 12px',
                    wordBreak: 'break-all',
                    lineHeight: 1.6,
                  }}
                >
                  {pay.address}
                </code>
                <button
                  onClick={() => void copyAddress()}
                  style={{
                    flex: '0 0 auto',
                    background: 'transparent',
                    border: '1px solid rgba(214,183,110,0.5)',
                    color: 'var(--color-gold)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: 2,
                    padding: '0 16px',
                    cursor: 'pointer',
                  }}
                >
                  {copied ? 'COPIED' : 'コピー'}
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  marginTop: 22,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: 3,
                  color: 'var(--muted)',
                }}
              >
                <span className="wait-dot" />
                送金を待っています…
              </div>
              <div className="scan-track" style={{ marginTop: 12 }} />
              <p
                style={{
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 11,
                  letterSpacing: 1,
                  color: 'var(--dim)',
                  marginTop: 12,
                  lineHeight: 1.9,
                  fontWeight: 300,
                }}
              >
                ※ 上記アドレスに正確な数量を、必ず {(pay.network ?? pay.currency).toUpperCase()}{' '}
                ネットワークで送金してください。
                <br />※ 送金が検知されると、この画面のまま自動でダウンロードに切り替わります(NOWPayments
                の画面で待つ必要はありません)。
                <br />※ 初めて取引所から送金する場合、出金がセキュリティ審査で保留されることがあります(数分〜数時間)。
                送金後はこの画面を閉じていただいて構いません。着金し次第そのまま自動でお渡しし、ご登録のメールにも受け渡しリンクをお送りします。
                {pay.currency === 'btc' && (
                  <>
                    <br />※ BTC はネットワークの都合で反映まで数分〜30分程度かかることがあります。
                  </>
                )}
              </p>
            </>
          )}

          {!deliverable && !awaitingPayment && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: 3,
                color: 'var(--muted)',
              }}
            >
              <span className="wait-dot" />
              STATUS · {order.status.toUpperCase()}
            </div>
          )}

          {!deliverable && !awaitingPayment && underpaid && (
            <p
              style={{
                fontFamily: 'var(--font-serif-jp)',
                fontSize: 12,
                letterSpacing: 1,
                color: 'var(--color-accent)',
                marginTop: 14,
                lineHeight: 1.9,
                fontWeight: 300,
              }}
            >
              お支払いいただいた額が不足しています。恐れ入りますが、こちらで確認のうえ個別にご連絡いたします。
              ご不明な点は注文番号を添えてお問い合わせください。
            </p>
          )}

          {/* expired/failed は遅延着金で自動復帰しうる。まだ間に合うことを前向きに伝える(取消は除く) */}
          {(order.status === 'expired' || order.status === 'failed') && (
            <p
              style={{
                fontFamily: 'var(--font-serif-jp)',
                fontSize: 12.5,
                letterSpacing: 1,
                color: 'var(--color-gold)',
                marginTop: 14,
                lineHeight: 2,
                fontWeight: 300,
              }}
            >
              受付の確保時間を過ぎましたが、<b style={{ color: 'var(--color-fg)' }}>まだ間に合います</b>。
              すでに送金がお済みか、これから着金する場合、<b style={{ color: 'var(--color-fg)' }}>入金を検知し次第そのまま自動でお渡しし、ご登録のメールにも受け渡しリンクをお送りします</b>。
              取引所の出金保留などで反映が遅れても大丈夫です。この画面は閉じていただいて構いません。
              <br />
              ※ 万一うまくいかない場合や、送金したのに数時間たっても届かない場合は、下記より注文番号を添えてご連絡ください。
            </p>
          )}

          {!deliverable &&
            !awaitingPayment &&
            order.status !== 'failed' &&
            order.status !== 'expired' &&
            order.status !== 'cancelled' &&
            !underpaid && (
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: 2,
                  color: 'var(--dim)',
                  marginTop: 14,
                  lineHeight: 1.8,
                }}
              >
                ※ 送金が検知されると、この画面は自動で受け渡しに切り替わります(手動更新不要・NOWPayments の画面で待つ必要はありません)。
                <br />※ 最終確認の完了時にはご登録のメールにも受け渡しリンクをお送りします。
              </p>
            )}

          {/* 困ったとき用の案内(受け渡し前の全状態=送金待ち/QR/期限切れ/失敗 等で表示) */}
          {!deliverable && (
            <div
              style={{
                marginTop: 32,
                padding: '18px 20px',
                border: '1px solid rgba(214,183,110,0.35)',
                background: 'rgba(214,183,110,0.05)',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 14,
                  fontWeight: 300,
                  letterSpacing: 1,
                  color: 'var(--color-gold-bright)',
                  marginBottom: 8,
                }}
              >
                こまったら、気軽に連絡してね
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 12,
                  lineHeight: 2,
                  letterSpacing: 1,
                  color: 'var(--muted)',
                  fontWeight: 300,
                  margin: 0,
                }}
              >
                「<b style={{ color: 'var(--color-fg)' }}>送金したのに反映されない</b>」「やり方がわからない」「入金できたか不安」——
                どんなことでも大丈夫です。はじめての暗号資産でも、こちらで一緒に確認します。下のメールに
                <b style={{ color: 'var(--color-fg)' }}>注文番号を書き添えて</b>ご連絡ください。
              </p>
              <div
                style={{
                  marginTop: 12,
                  display: 'flex',
                  gap: 16,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <a
                  href={helpMailto}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    letterSpacing: 1,
                    color: 'var(--color-gold-bright)',
                    textDecoration: 'underline',
                  }}
                >
                  contact@rou39.com
                </a>
                <Link
                  to="/guide"
                  target="_blank"
                  rel="noopener"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    letterSpacing: 1,
                    color: 'var(--color-gold)',
                    textDecoration: 'underline',
                  }}
                >
                  はじめての方へ・送金ガイド ↗
                </Link>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: 1,
                    color: 'var(--dim)',
                  }}
                >
                  注文番号: {order.order_id.slice(0, 8).toUpperCase()}
                </span>
              </div>
            </div>
          )}

          <div style={{ marginTop: 48, display: 'flex', gap: 14 }}>
            <Link to="/" style={{ textDecoration: 'none' }}>
              <BarButton variant="outline">← INDEX に戻る</BarButton>
            </Link>
          </div>
        </div>

        {/* 右:受領証カード */}
        <div className="anim-reveal anim-delay-2">
          <BrassFrame padding="36px 32px" background="var(--color-panel)">
            {/* 「領収 / PAID」印鑑(状態が変わると据わり直す) */}
            <div
              key={order.status}
              className="anim-stamp"
              style={{
                position: 'absolute',
                top: 18,
                right: 18,
                padding: '5px 10px',
                border: `1px solid ${deliverable ? 'var(--color-gold-bright)' : 'rgba(168,166,158,0.35)'}`,
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                letterSpacing: 3,
                color: deliverable ? 'var(--color-gold-bright)' : 'var(--dim)',
              }}
            >
              {paid ? 'PAID' : confirming ? 'CONFIRMING' : 'PENDING'}
            </div>

            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: 3,
                color: 'var(--color-gold)',
                marginBottom: 22,
              }}
            >
              RECEIPT
            </div>

            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: 2,
                color: 'var(--muted)',
                lineHeight: 2,
                marginBottom: 18,
              }}
            >
              <div>№ {order.order_id.slice(0, 8).toUpperCase()}</div>
              <div>DATE {fmtJst(order.created_at)}</div>
              <div>
                ITEM {order.product_id}
              </div>
              <div>STATUS {order.status.toUpperCase()}</div>
            </div>

            <Ornament style={{ margin: '18px 0' }} />

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginTop: 14,
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
                {paid ? 'PAID' : confirming ? 'RECEIVED' : 'DUE'}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 24,
                  fontWeight: 300,
                  letterSpacing: 3,
                  color: 'var(--color-gold-bright)',
                }}
              >
                ¥ {order.price_jpy.toLocaleString()}
              </span>
            </div>

            {order.currency && (
              <div
                style={{
                  marginTop: 10,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  letterSpacing: 2,
                  color: 'var(--dim)',
                  textAlign: 'right',
                }}
              >
                VIA · {order.currency.toUpperCase()}
              </div>
            )}
          </BrassFrame>
        </div>
      </div>
    </div>
  );
}
