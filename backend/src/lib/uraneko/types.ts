export interface VideoProduct {
  product_id: string;
  title: string;
  description: string;
  price_jpy: number;
  duration_sec: number;
  thumbnail_s3_key: string;
  source_s3_key: string;
  pool_target: number;
  pool_threshold: number;
  published: boolean;
  created_at: string;
}

export interface VideoToken {
  token_id: string;
  product_id: string;
  s3_key: string;
  bits: string;
  status: 'unassigned' | 'assigned';
  status_created_at: string; // GSI SK: "unassigned#<iso>" or "assigned#<iso>"
  assigned_to: string | null;
  assigned_at: string | null;
  order_id: string | null;
  created_at: string;
}

export type OrderStatus = 'pending' | 'confirming' | 'paid' | 'failed' | 'expired';

export interface Order {
  order_id: string;
  user_id: string; // Cognito sub or "guest:<email_hash>"
  email: string;
  product_id: string;
  token_id: string | null; // 支払い完了時に割当
  price_jpy: number; // 実際の請求額(割引後)
  original_price_jpy?: number; // クーポン適用前の元価格
  coupon_code?: string | null; // 適用したクーポン(未使用なら null/未設定)
  discount_jpy?: number; // 割引額(元価格 - 請求額)
  price_crypto: string;
  currency: string;
  nowpayments_payment_id: string; // 無料購入(100%割引)の場合は "free"
  status: OrderStatus;
  created_at: string;
  paid_at: string | null;
}

// クーポン(特定商品限定・総利用上限のみで管理)
export interface Coupon {
  coupon_code: string;
  product_id: string; // 適用対象の商品(必須)
  discount_percent: number; // 1..100(100 = 無料)
  max_redemptions: number; // 総利用上限
  redeemed_count: number; // 利用済み数(予約時に原子的に +1)
  expires_at?: string; // ISO8601。無期限なら属性を持たせない
  created_at: string;
}
