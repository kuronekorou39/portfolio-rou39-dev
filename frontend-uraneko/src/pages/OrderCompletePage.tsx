import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { api, type OrderDetail } from '../lib/api';
import { useIsNarrow } from '../lib/useIsNarrow';
import { getIdToken } from '../lib/auth';
import Ornament from '../components/bar/Ornament';
import SectionLabel from '../components/bar/SectionLabel';
import BarButton from '../components/bar/BarButton';
import BrassFrame from '../components/bar/BrassFrame';

export default function OrderCompletePage() {
  const { id } = useParams<{ id: string }>();
  const isNarrow = useIsNarrow();
  const [params] = useSearchParams();
  const emailToken = params.get('token');

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // 暗号決済の確定は IPN 経由で非同期。pending/confirming の間は定期的に再取得し、
  // paid になったら自動でダウンロードリンクを出す(ユーザーが手動更新しなくて済む)。
  useEffect(() => {
    if (!id) return;
    const POLL_INTERVAL_MS = 8000;
    const POLL_MAX_MS = 30 * 60 * 1000; // これ以上は打ち切り(後でメールから開けばよい)
    const TERMINAL = new Set(['paid', 'failed', 'expired']);
    const startedAt = Date.now();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      const idToken = await getIdToken();
      try {
        const o = await api.getOrder(id, { token: emailToken ?? undefined, idToken });
        if (stopped) return;
        setOrder(o);
        if (!TERMINAL.has(o.status) && Date.now() - startedAt < POLL_MAX_MS) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (e) {
        if (stopped) return;
        setErr((e as Error).message);
      }
    };
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, emailToken]);

  if (err)
    return <p style={{ color: '#e66', fontFamily: 'var(--font-serif-jp)' }}>エラー: {err}</p>;
  if (!order)
    return (
      <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-serif-jp)' }}>
        読み込み中...
      </p>
    );

  const paid = order.status === 'paid';

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isNarrow ? '1fr' : '1fr 420px',
          gap: isNarrow ? 40 : 56,
        }}
      >
        {/* 左 */}
        <div>
          <SectionLabel style={{ marginBottom: 18 }}>
            — {paid ? 'DELIVERED' : 'AWAITING CONFIRMATION'}
          </SectionLabel>
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
            {paid ? (
              <>受け渡し完了。</>
            ) : (
              <>送金待ち。</>
            )}
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
            {paid ? 'your copy is ready.' : 'waiting for confirmations.'}
          </div>

          <Ornament style={{ margin: '36px 0', maxWidth: 320 }} />

          {paid && order.download_url && (
            <>
              <SectionLabel style={{ marginBottom: 14 }}>— FILE · 受け渡し</SectionLabel>
              <a
                href={order.download_url}
                download
                style={{ textDecoration: 'none' }}
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
            </>
          )}

          {!paid && (
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
              <span
                className="pulse-dot"
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: 'var(--color-gold)',
                  boxShadow: '0 0 12px var(--color-gold)',
                  animation: 'pulse 2s ease-in-out infinite',
                }}
              />
              STATUS · {order.status.toUpperCase()}
            </div>
          )}

          {!paid && order.status !== 'failed' && order.status !== 'expired' && (
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
              ※ 送金確認後、この画面は自動で受け渡しに切り替わります(手動更新不要)。
              <br />※ 確認完了時にはご登録のメールにも受け渡しリンクをお送りします。
            </p>
          )}

          <style>{`@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }`}</style>

          <div style={{ marginTop: 48, display: 'flex', gap: 14 }}>
            <Link to="/" style={{ textDecoration: 'none' }}>
              <BarButton variant="outline">← INDEX に戻る</BarButton>
            </Link>
          </div>
        </div>

        {/* 右:受領証カード */}
        <div>
          <BrassFrame padding="36px 32px" background="var(--color-panel)">
            {/* 「領収 / PAID」印鑑 */}
            <div
              style={{
                position: 'absolute',
                top: 18,
                right: 18,
                padding: '5px 10px',
                border: `1px solid ${paid ? 'var(--color-gold-bright)' : 'rgba(168,166,158,0.35)'}`,
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                letterSpacing: 3,
                color: paid ? 'var(--color-gold-bright)' : 'var(--dim)',
              }}
            >
              {paid ? 'PAID' : 'PENDING'}
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
              <div>DATE {new Date(order.created_at).toLocaleDateString('ja-JP')}</div>
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
                {paid ? 'PAID' : 'DUE'}
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
