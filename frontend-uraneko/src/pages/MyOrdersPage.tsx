import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type OrderSummary } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { getIdToken, getGoogleLoginUrl } from '../lib/auth';
import Ornament from '../components/bar/Ornament';
import SectionLabel from '../components/bar/SectionLabel';
import BarButton from '../components/bar/BarButton';
import BrassFrame from '../components/bar/BrassFrame';

function StatusBadge({ status }: { status: OrderSummary['status'] }) {
  const paid = status === 'paid';
  const failed = status === 'failed' || status === 'expired';
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        letterSpacing: 3,
        padding: '3px 9px',
        color: paid ? '#120808' : failed ? '#e66' : 'var(--color-gold)',
        background: paid ? 'var(--color-gold)' : 'transparent',
        border: `1px solid ${
          paid ? 'var(--color-gold)' : failed ? 'rgba(230,102,102,0.6)' : 'rgba(201,169,97,0.5)'
        }`,
      }}
    >
      {status.toUpperCase()}
    </span>
  );
}

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

  if (loading)
    return (
      <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-serif-jp)' }}>
        読み込み中...
      </p>
    );

  if (!user)
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <SectionLabel style={{ marginBottom: 18 }}>— MEMBERS ONLY</SectionLabel>
        <p
          style={{
            fontFamily: 'var(--font-serif-jp)',
            fontSize: 16,
            fontWeight: 300,
            letterSpacing: 2,
            color: 'var(--muted)',
            marginBottom: 32,
          }}
        >
          購入履歴のご確認には
          <br />
          会員ログインが必要です。
        </p>
        <a href={getGoogleLoginUrl()} style={{ textDecoration: 'none' }}>
          <BarButton size="lg">SIGN IN · ログイン</BarButton>
        </a>
      </div>
    );

  if (err) return <p style={{ color: '#e66' }}>{err}</p>;
  if (!orders)
    return (
      <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-serif-jp)' }}>
        読み込み中...
      </p>
    );

  const paidCount = orders.filter((o) => o.status === 'paid').length;
  const totalPaid = orders
    .filter((o) => o.status === 'paid')
    .reduce((sum, o) => sum + o.price_jpy, 0);

  return (
    <div>
      {/* 会員マストヘッド */}
      <BrassFrame padding="36px 40px" background="var(--color-panel)" style={{ marginBottom: 48 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 40 }}>
          <div>
            <SectionLabel style={{ marginBottom: 8 }}>— MEMBER</SectionLabel>
            <div
              style={{
                fontFamily: 'var(--font-serif-jp)',
                fontSize: 28,
                fontWeight: 300,
                letterSpacing: 4,
                color: 'var(--color-fg)',
              }}
            >
              お客様
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: 3,
                color: 'var(--muted)',
                marginTop: 4,
              }}
            >
              {user.email}
            </div>
          </div>
          <div>
            <SectionLabel style={{ marginBottom: 8 }}>— WORKS</SectionLabel>
            <div
              style={{
                fontFamily: 'var(--font-serif-jp)',
                fontSize: 32,
                fontWeight: 300,
                color: 'var(--color-gold-bright)',
              }}
            >
              {paidCount}
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  letterSpacing: 3,
                  color: 'var(--muted)',
                  marginLeft: 10,
                }}
              >
                PAID
              </span>
            </div>
          </div>
          <div>
            <SectionLabel style={{ marginBottom: 8 }}>— TOTAL</SectionLabel>
            <div
              style={{
                fontFamily: 'var(--font-serif-jp)',
                fontSize: 32,
                fontWeight: 300,
                color: 'var(--color-gold-bright)',
              }}
            >
              ¥ {totalPaid.toLocaleString()}
            </div>
          </div>
        </div>
      </BrassFrame>

      {/* 購入履歴 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}
      >
        <div>
          <SectionLabel style={{ marginBottom: 8 }}>— LIBRARY</SectionLabel>
          <h2
            style={{
              fontFamily: 'var(--font-serif-jp)',
              fontSize: 26,
              fontWeight: 300,
              letterSpacing: 5,
              margin: 0,
              color: 'var(--color-fg)',
            }}
          >
            お預かり品
          </h2>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: 3,
            color: 'var(--muted)',
          }}
        >
          {orders.length} ITEMS
        </div>
      </div>

      <Ornament style={{ margin: '20px 0 28px' }} />

      {orders.length === 0 ? (
        <p
          style={{
            fontFamily: 'var(--font-serif-jp)',
            color: 'var(--muted)',
            textAlign: 'center',
            padding: '40px 0',
            letterSpacing: 2,
          }}
        >
          まだお預かり品がございません。
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            border: '1px solid rgba(201,169,97,0.25)',
          }}
        >
          {orders.map((o, i) => (
            <li
              key={o.order_id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 160px 120px 120px',
                alignItems: 'center',
                padding: '20px 24px',
                borderBottom:
                  i === orders.length - 1 ? 'none' : '1px solid rgba(201,169,97,0.12)',
                gap: 24,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: 3,
                    color: 'var(--color-gold)',
                    marginBottom: 4,
                  }}
                >
                  № {o.order_id.slice(0, 8).toUpperCase()}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-serif-jp)',
                    fontSize: 15,
                    fontWeight: 300,
                    letterSpacing: 2,
                    color: 'var(--color-fg)',
                  }}
                >
                  {o.product_id}
                </div>
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: 2,
                  color: 'var(--muted)',
                }}
              >
                {new Date(o.created_at).toLocaleDateString('ja-JP')}
              </div>
              <div>
                <StatusBadge status={o.status} />
              </div>
              <div style={{ textAlign: 'right' }}>
                {o.status === 'paid' ? (
                  <Link
                    to={`/order/${o.order_id}/complete`}
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: 11,
                      fontStyle: 'italic',
                      letterSpacing: 3,
                      color: 'var(--color-gold)',
                      textDecoration: 'underline',
                    }}
                  >
                    download
                  </Link>
                ) : (
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'var(--dim)',
                    }}
                  >
                    —
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
