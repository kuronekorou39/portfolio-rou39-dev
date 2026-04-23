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
  thumbnail_s3_key: string;
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
  checkout(params: { product_id: string; email?: string; pay_currency?: string }, idToken?: string | null) {
    return request<{ order_id: string; invoice_url: string }>('/checkout', {
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
