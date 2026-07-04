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
  thumbnail_url?: string | null; // サムネの presigned URL。未設定なら null
  sample_urls?: string[]; // 追加プレビュー画像の presigned URL(表示順)。get-product のみ
  available?: boolean; // 在庫(未割当トークン)有無。未定義なら不明扱い
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
  invoice_url?: string; // 通常/割引あり: NOWPayments 決済ページ
  free?: boolean; // 100%割引(無料)購入
  complete_url?: string; // 無料購入時の受領ページ(署名トークン付き)
}

export interface OrderSummary {
  order_id: string;
  product_id: string;
  price_jpy: number;
  currency: string;
  status: 'pending' | 'confirming' | 'paid' | 'failed' | 'expired';
  created_at: string;
  paid_at: string | null;
}

export interface OrderDetail extends OrderSummary {
  download_url: string | null;
  download_url_expires_in?: number;
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
};
