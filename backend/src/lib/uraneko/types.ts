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
  price_jpy: number;
  price_crypto: string;
  currency: string;
  nowpayments_payment_id: string;
  status: OrderStatus;
  created_at: string;
  paid_at: string | null;
}
