export interface VideoProduct {
  product_id: string;
  title: string;
  description: string;
  price_jpy: number;
  duration_sec: number;
  thumbnail_s3_key: string;
  thumbnail_blur?: 'none' | 'light' | 'strong';
  thumbnail_reveal?: boolean; // 拡大時に原画を見せるか(blur!=none のときのみ意味を持つ)
  // 追加プレビュー画像(samples/<product_id>/<uuid>)。順序=表示順。各画像に blur/reveal
  samples?: { key: string; blur: 'none' | 'light' | 'strong'; reveal: boolean }[];
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
  status: 'unassigned' | 'reserved' | 'assigned';
  status_created_at: string; // GSI SK: "unassigned#<iso>" / "reserved#<iso>" / "assigned#<iso>"
  reserved_until?: string; // reserved の失効時刻(ISO)。期限切れは cleanup が在庫へ戻す
  assigned_to: string | null;
  assigned_at: string | null;
  order_id: string | null;
  created_at: string;
}

export type OrderStatus =
  | 'pending' // 注文作成済み・入金未検知
  | 'confirming' // 入金検知(0-conf)。ダウンロード可能。最終確認待ち(控えメール未送)
  | 'paid' // 最終確認完了。受け渡し確定 + 控えメール送信済み
  | 'underpaid' // 支払額不足。自動受け渡しはせず管理者が対応する
  | 'failed'
  | 'expired'
  | 'cancelled'; // 購入者が未払い注文を明示的にキャンセル

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
  // 自前決済ページ用の送金情報(NOWPayments /v1/payment 由来)。無料購入では未設定。
  pay_address?: string;
  pay_amount?: number; // 送金すべき暗号資産の数量
  pay_currency?: string; // "ltc" | "btc"
  pay_network?: string;
  pay_valid_until?: string | null; // 送金先の有効期限(ISO)
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
