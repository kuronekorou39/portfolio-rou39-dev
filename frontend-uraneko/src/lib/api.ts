const BASE_URL = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed ${res.status}`);
  }
  return res.json();
}

function authHeaders(token?: string | null): HeadersInit {
  const h: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) (h as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  return h;
}

export interface Product {
  product_id: string;
  title: string;
  description: string;
  price_jpy: number;
  duration_sec: number;
  thumbnail_url?: string | null; // サムネの表示URL(ぼかし指定ならぼかし版)
  // ギャラリー(サムネ+サンプル)。get-product のみ。zoom_url=null は拡大でも原画を出さない
  gallery?: { url: string; zoom_url: string | null }[];
  available?: boolean; // 在庫(未割当トークン)有無。未定義なら不明扱い
  featured?: boolean; // トップの注目枠に出す商品(管理画面で指定)
}

export interface CouponValidationResult {
  valid: boolean;
  reason?: string; // 無効時のエラーコード(coupon_invalid 等)
  discount_percent?: number;
  original_price_jpy?: number;
  final_price_jpy?: number;
}

export interface CheckoutResult {
  order_id: string;
  free?: boolean; // 100%割引(無料)購入
  complete_url?: string; // 決済(=完了)ページ。署名トークン付き。有料も無料もここへ遷移
}

export interface OrderSummary {
  order_id: string;
  product_id: string;
  price_jpy: number;
  currency: string;
  status: 'pending' | 'confirming' | 'paid' | 'underpaid' | 'failed' | 'expired' | 'cancelled';
  created_at: string;
  paid_at: string | null;
}

export interface PaymentInfo {
  address: string;
  amount: number; // 送金すべき暗号資産の数量
  currency: string; // "ltc" | "btc"
  network?: string;
  valid_until?: string | null;
}

export interface OrderDetail extends OrderSummary {
  download_url: string | null;
  download_url_expires_in?: number;
  pay?: PaymentInfo | null; // 支払い待ち(pending/underpaid)のときの送金情報
}

export const api = {
  listProducts(): Promise<Product[]> {
    return request<Product[]>('/products');
  },
  getProduct(id: string): Promise<Product> {
    return request<Product>(`/products/${id}`);
  },
  // クーポンの事前検証(注文は作らない)。購入画面の「適用」ボタン用
  validateCoupon(params: { product_id: string; coupon_code: string }) {
    return request<CouponValidationResult>('/coupons/validate', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(params),
    });
  },
  checkout(
    params: { product_id: string; email?: string; pay_currency?: string; coupon_code?: string },
    idToken?: string | null,
  ) {
    return request<CheckoutResult>('/checkout', {
      method: 'POST',
      headers: authHeaders(idToken),
      body: JSON.stringify(params),
    });
  },
  getOrder(orderId: string, opts: { token?: string; idToken?: string | null }) {
    const qs = opts.token ? `?token=${encodeURIComponent(opts.token)}` : '';
    return request<OrderDetail>(`/orders/${orderId}${qs}`, {
      headers: authHeaders(opts.idToken),
    });
  },
  myOrders(idToken: string) {
    return request<OrderSummary[]>('/my/orders', { headers: authHeaders(idToken) });
  },
  // 未払い(pending)注文のキャンセル。予約中の在庫を即開放する。会員は idToken、
  // ゲストは署名済み注文トークン(token)で認可。
  cancelOrder(orderId: string, opts: { idToken?: string | null; token?: string }) {
    return request<{ order_id: string; status: OrderSummary['status']; cancelled: boolean }>(
      `/orders/${orderId}/cancel`,
      {
        method: 'POST',
        headers: authHeaders(opts.idToken),
        body: JSON.stringify(opts.token ? { token: opts.token } : {}),
      },
    );
  },
};
