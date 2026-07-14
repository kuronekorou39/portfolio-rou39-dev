import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type OrderSummary } from '../lib/api';
import { fmtJst } from '../lib/format';
import { useIsNarrow } from '../lib/useIsNarrow';
import { useAuth } from '../contexts/AuthContext';
import { getIdToken, deleteAccount } from '../lib/auth';
import AuthModal from '../components/AuthModal';
import Ornament from '../components/bar/Ornament';
import SectionLabel from '../components/bar/SectionLabel';
import BarButton from '../components/bar/BarButton';
import BrassFrame from '../components/bar/BrassFrame';
import Loading from '../components/bar/Loading';

const STATUS_LABEL: Record<string, string> = {
  paid: '受渡済',
  pending: '支払い待ち',
  confirming: '確認中(受渡可)',
  underpaid: '支払額不足',
  failed: '失敗',
  expired: '期限切れ',
  cancelled: 'キャンセル済',
};

// confirming は「先行受け渡し済み(DL可)・最終確認待ち」なのでダウンロード可能扱い。
function isDeliverable(status: OrderSummary['status']): boolean {
  return status === 'paid' || status === 'confirming';
}

function StatusBadge({ status }: { status: OrderSummary['status'] }) {
  const paid = status === 'paid';
  const deliverable = isDeliverable(status); // paid or confirming(受渡可)
  const waiting = status === 'pending' || status === 'underpaid'; // 入金待ち/対応待ち(失敗ではない)
  const failed = status === 'failed' || status === 'expired' || status === 'cancelled';
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        letterSpacing: 3,
        padding: '3px 9px',
        whiteSpace: 'nowrap',
        color: paid ? '#0a0a0b' : failed ? '#e66' : 'var(--color-gold)',
        background: paid ? 'var(--color-gold)' : 'transparent',
        border: `1px solid ${
          paid
            ? 'var(--color-gold)'
            : failed
            ? 'rgba(230,102,102,0.6)'
            : deliverable || waiting
            ? 'rgba(214,183,110,0.5)'
            : 'rgba(168,166,158,0.5)'
        }`,
      }}
    >
      {STATUS_LABEL[status] ?? status.toUpperCase()}
    </span>
  );
}

export default function MyOrdersPage() {
  const isNarrow = useIsNarrow();
  const navigate = useNavigate();
  const { user, loading, refresh } = useAuth();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteErr(null);
    try {
      await deleteAccount();
      await refresh();
      navigate('/', { replace: true });
    } catch (e) {
      setDeleteErr('退会処理に失敗しました: ' + (e as Error).message);
      setDeleting(false);
    }
  }

  async function handleCancel(orderId: string) {
    if (!window.confirm('この注文をキャンセルしますか?(確保していた在庫は開放されます)')) return;
    setCancellingId(orderId);
    try {
      const idToken = await getIdToken();
      if (!idToken) return;
      const r = await api.cancelOrder(orderId, { idToken });
      setOrders((prev) =>
        prev ? prev.map((o) => (o.order_id === orderId ? { ...o, status: r.status } : o)) : prev,
      );
    } catch (e) {
      alert('キャンセルに失敗しました: ' + (e as Error).message);
    } finally {
      setCancellingId(null);
    }
  }

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
      <Loading />
    );

  if (!user)
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <SectionLabel style={{ marginBottom: 18 }}>— ACCOUNT</SectionLabel>
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
          記録の閲覧には
          <br />
          ログインが必要。
        </p>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setAuthOpen(true);
          }}
          style={{ textDecoration: 'none' }}
        >
          <BarButton size="lg">SIGN IN · ログイン</BarButton>
        </a>
        <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} googleReturnTo="/my/orders" />
      </div>
    );

  if (err) return <p style={{ color: '#e66' }}>{err}</p>;
  if (!orders)
    return (
      <Loading />
    );

  // 受け渡し済み(paid)+ 先行受け渡し済み(confirming)を実績として集計する。
  const deliveredOrders = orders.filter((o) => isDeliverable(o.status));
  const paidCount = deliveredOrders.length;
  const totalPaid = deliveredOrders.reduce((sum, o) => sum + o.price_jpy, 0);

  return (
    <div>
      {/* 会員マストヘッド */}
      <BrassFrame
        className="anim-reveal"
        padding="clamp(22px, 5vw, 36px) clamp(20px, 5vw, 40px)"
        background="var(--color-panel)"
        style={{ marginBottom: 48 }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 'clamp(20px, 4vw, 40px)',
          }}
        >
          <div>
            <SectionLabel style={{ marginBottom: 8 }}>— ACCOUNT</SectionLabel>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 18,
                fontWeight: 300,
                letterSpacing: 4,
                color: 'var(--color-fg)',
              }}
            >
              member
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: 3,
                color: 'var(--muted)',
                marginTop: 4,
                overflowWrap: 'anywhere',
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
        className="anim-reveal anim-delay-2"
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
            記録
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
          {orders.length} FILES
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
          記録なし。
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            border: '1px solid rgba(168,166,158,0.25)',
          }}
        >
          {orders.map((o, i) => (
            <li
              key={o.order_id}
              style={{
                display: 'grid',
                gridTemplateColumns: isNarrow ? '1fr auto' : '1fr 160px 120px 120px',
                alignItems: 'center',
                padding: isNarrow ? '16px 16px' : '20px 24px',
                borderBottom:
                  i === orders.length - 1 ? 'none' : '1px solid rgba(168,166,158,0.12)',
                gap: isNarrow ? '10px 16px' : 24,
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
                {fmtJst(o.created_at)}
              </div>
              <div>
                <StatusBadge status={o.status} />
              </div>
              <div style={{ textAlign: 'right' }}>
                {isDeliverable(o.status) ? (
                  <Link
                    to={`/order/${o.order_id}/complete`}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      letterSpacing: 3,
                      color: 'var(--color-gold-bright)',
                      textDecoration: 'underline',
                    }}
                  >
                    download
                  </Link>
                ) : o.status === 'pending' ? (
                  <button
                    onClick={() => void handleCancel(o.order_id)}
                    disabled={cancellingId === o.order_id}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(230,102,102,0.4)',
                      color: '#e66',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      letterSpacing: 2,
                      padding: '4px 10px',
                      cursor: cancellingId === o.order_id ? 'default' : 'pointer',
                      opacity: cancellingId === o.order_id ? 0.5 : 1,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {cancellingId === o.order_id ? '処理中…' : 'キャンセル'}
                  </button>
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

      {orders.some((o) => o.status === 'confirming') && (
        <p
          style={{
            marginTop: 16,
            fontFamily: 'var(--font-serif-jp)',
            fontSize: 11,
            lineHeight: 1.8,
            letterSpacing: 1,
            color: 'var(--color-gold)',
            fontWeight: 300,
          }}
        >
          ※「確認中(受渡可)」は入金を検知しダウンロード可能な状態です。ブロックチェーン上の最終確認が完了すると「受渡済」になり、控えのメールをお送りします。
        </p>
      )}

      {orders.some((o) => o.status === 'pending' || o.status === 'underpaid') && (
        <p
          style={{
            marginTop: 12,
            fontFamily: 'var(--font-serif-jp)',
            fontSize: 11,
            lineHeight: 1.8,
            letterSpacing: 1,
            color: 'var(--dim)',
            fontWeight: 300,
          }}
        >
          ※「支払い待ち」の注文は、入金が確認できないまま一定時間が過ぎると自動的にキャンセルされます(在庫は開放されます)。「支払額不足」は個別にご連絡します。
        </p>
      )}

      {/* 退会 */}
      <Ornament style={{ margin: '56px 0 24px' }} />
      <div style={{ textAlign: 'center' }}>
        <SectionLabel style={{ marginBottom: 14 }}>— MEMBERSHIP</SectionLabel>
        {!confirmDelete ? (
          <button
            onClick={() => {
              setConfirmDelete(true);
              setDeleteErr(null);
            }}
            style={{
              background: 'transparent',
              border: '1px solid rgba(168,166,158,0.35)',
              color: 'var(--muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: 3,
              padding: '9px 20px',
              cursor: 'pointer',
            }}
          >
            退会(アカウント削除)
          </button>
        ) : (
          <div style={{ maxWidth: 460, margin: '0 auto' }}>
            <p
              style={{
                fontFamily: 'var(--font-serif-jp)',
                fontSize: 13,
                fontWeight: 300,
                lineHeight: 1.9,
                letterSpacing: 1,
                color: 'var(--color-fg)',
                marginBottom: 6,
              }}
            >
              本当に退会しますか?
            </p>
            <p
              style={{
                fontFamily: 'var(--font-serif-jp)',
                fontSize: 11,
                fontWeight: 300,
                lineHeight: 1.9,
                letterSpacing: 1,
                color: 'var(--muted)',
                marginBottom: 20,
              }}
            >
              アカウントは即時削除され、再ログインはできなくなります。購入済みの記録(LIBRARY)へのアクセスも失われます。この操作は取り消せません。
              <br />
              ※ 購入時にお送りした受け渡しメールのリンクは引き続きご利用いただけます。
            </p>
            {deleteErr && (
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: 1,
                  color: '#e66',
                  marginBottom: 16,
                }}
              >
                {deleteErr}
              </p>
            )}
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => void handleDeleteAccount()}
                disabled={deleting}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(230,102,102,0.6)',
                  color: '#e66',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: 3,
                  padding: '10px 22px',
                  cursor: deleting ? 'default' : 'pointer',
                  opacity: deleting ? 0.5 : 1,
                }}
              >
                {deleting ? '処理中…' : '退会を確定する'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(168,166,158,0.35)',
                  color: 'var(--muted)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: 3,
                  padding: '10px 22px',
                  cursor: deleting ? 'default' : 'pointer',
                }}
              >
                やめる
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
