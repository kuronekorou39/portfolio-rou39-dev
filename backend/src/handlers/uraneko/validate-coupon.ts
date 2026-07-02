import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../lib/dynamo';
import { ok, badRequest, notFound, serverError } from '../../lib/response';
import { getCoupon, validateCoupon, applyDiscount } from '../../lib/uraneko/coupon';
import { MIN_INVOICE_JPY } from '../../lib/uraneko/nowpayments';
import type { VideoProduct } from '../../lib/uraneko/types';

const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE!;

/**
 * クーポンの事前検証(購入画面の「適用」ボタン用)。
 * 注文は作らず、利用枠(redeemed_count)も消費しない表示用のソフトチェック。
 * 確定時の再検証と枠予約は checkout 側が原子的に行うため、ここの結果を信用した
 * 金額操作はできない。有効/無効は 200 + valid フラグで返す(4xx はリクエスト不備のみ)。
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    let body: { product_id?: string; coupon_code?: string };
    try {
      body = JSON.parse(event.body ?? '');
    } catch {
      return badRequest('malformed body');
    }
    const { product_id, coupon_code } = body;
    if (!product_id || !coupon_code) return badRequest('product_id and coupon_code required');

    const res = await docClient.send(
      new GetCommand({ TableName: PRODUCTS_TABLE, Key: { product_id } }),
    );
    const product = res.Item as VideoProduct | undefined;
    if (!product || !product.published) return notFound('product');

    const coupon = await getCoupon(coupon_code);
    if (!coupon) return ok({ valid: false, reason: 'coupon_invalid' });

    const v = validateCoupon(coupon, product_id, new Date().toISOString());
    if (!v.ok) return ok({ valid: false, reason: v.reason ?? 'coupon_invalid' });

    const final_price_jpy = applyDiscount(product.price_jpy, coupon.discount_percent);
    // checkout と同じ規則に揃える: 無料(0円)が許されるのは 100% クーポンのみ。
    // 端数丸めで 0 円になる <100% クーポン(例: ¥49×99%)は決済不能なので無効扱い。
    const isFullFree = coupon.discount_percent === 100 && final_price_jpy === 0;
    if (final_price_jpy < MIN_INVOICE_JPY && !isFullFree) {
      return ok({ valid: false, reason: 'amount_too_small' });
    }

    return ok({
      valid: true,
      discount_percent: coupon.discount_percent,
      original_price_jpy: product.price_jpy,
      final_price_jpy,
    });
  } catch (err) {
    console.error('validate-coupon error:', err);
    return serverError();
  }
}
