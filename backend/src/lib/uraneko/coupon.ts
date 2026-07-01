import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../dynamo';
import type { Coupon } from './types';

const COUPONS_TABLE = process.env.COUPONS_TABLE!;

export async function getCoupon(coupon_code: string): Promise<Coupon | null> {
  const res = await docClient.send(
    new GetCommand({ TableName: COUPONS_TABLE, Key: { coupon_code } }),
  );
  return (res.Item as Coupon | undefined) ?? null;
}

export interface CouponValidation {
  ok: boolean;
  reason?: string;
}

/**
 * 予約前のソフトチェック(商品一致・有効期限・利用上限)。
 * 実際の上限 enforce は reserveRedemption の条件付き更新で原子的に行う。
 */
export function validateCoupon(coupon: Coupon, product_id: string, nowIso: string): CouponValidation {
  if (coupon.product_id !== product_id) return { ok: false, reason: 'coupon_not_applicable' };
  if (coupon.expires_at && coupon.expires_at <= nowIso) return { ok: false, reason: 'coupon_expired' };
  if (coupon.redeemed_count >= coupon.max_redemptions) return { ok: false, reason: 'coupon_exhausted' };
  return { ok: true };
}

/** 割引後金額(円・整数)。discount_percent は 0..100 にクランプ。 */
export function applyDiscount(price_jpy: number, discount_percent: number): number {
  const pct = Math.max(0, Math.min(100, discount_percent));
  return Math.round((price_jpy * (100 - pct)) / 100);
}

/**
 * 利用枠を原子的に予約(redeemed_count を +1)。
 * 条件: クーポンが存在し、redeemed_count < max_redemptions かつ未失効。
 * 満たさなければ false(= 上限到達 / 失効 / 不存在)。
 * ※ 無期限クーポンは expires_at 属性を持たない前提(NULL 型では書かない)。
 */
export async function reserveRedemption(coupon_code: string, nowIso: string): Promise<boolean> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: COUPONS_TABLE,
        Key: { coupon_code },
        UpdateExpression: 'SET redeemed_count = redeemed_count + :one',
        ConditionExpression:
          'attribute_exists(coupon_code) AND redeemed_count < max_redemptions AND (attribute_not_exists(expires_at) OR expires_at > :now)',
        ExpressionAttributeValues: { ':one': 1, ':now': nowIso },
      }),
    );
    return true;
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

/** 予約のロールバック(下流失敗時のベストエフォート減算)。 */
export async function releaseRedemption(coupon_code: string): Promise<void> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: COUPONS_TABLE,
        Key: { coupon_code },
        UpdateExpression: 'SET redeemed_count = redeemed_count - :one',
        ConditionExpression: 'redeemed_count > :zero',
        ExpressionAttributeValues: { ':one': 1, ':zero': 0 },
      }),
    );
  } catch (err: unknown) {
    console.error('releaseRedemption failed (non-fatal):', (err as { name?: string })?.name);
  }
}
