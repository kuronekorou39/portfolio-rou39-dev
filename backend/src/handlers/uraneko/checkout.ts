import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createHash, randomUUID } from 'crypto';
import { docClient } from '../../lib/dynamo';
import { ok, badRequest, notFound, conflict, serverError } from '../../lib/response';
import { createPayment, MIN_INVOICE_JPY } from '../../lib/uraneko/nowpayments';
import { hasAvailableToken, reserveToken, releaseReservedToken } from '../../lib/uraneko/token-claim';
import {
  getCoupon,
  validateCoupon,
  applyDiscount,
  reserveRedemption,
  releaseRedemption,
} from '../../lib/uraneko/coupon';
import { fulfillPaidOrder } from '../../lib/uraneko/fulfill';
import { verifyMember, authHeaderOf } from '../../lib/uraneko/member-auth';
import { signOrderToken } from '../../lib/uraneko/order-token';
import type { Order, VideoProduct } from '../../lib/uraneko/types';

const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE!;
const ORDERS_TABLE = process.env.ORDERS_TABLE!;
const SITE_BASE_URL = process.env.URANEKO_SITE_URL!; // https://uraneko.rou39.com
const API_BASE_URL = process.env.URANEKO_API_URL!; // https://uraneko.rou39.com/api

function emailHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 16);
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (event.httpMethod !== 'POST') return badRequest('Unsupported method');

    const body = JSON.parse(event.body || '{}');
    const { product_id, email, pay_currency, coupon_code } = body as {
      product_id?: string;
      email?: string;
      pay_currency?: string;
      coupon_code?: string;
    };
    if (!product_id) return badRequest('product_id required');

    // /checkout はオーソライザー無し(ゲスト併用)なので、Authorization ヘッダーの
    // Cognito IDトークンを Lambda 側で検証して会員か判定する。無効/無ければゲスト。
    const member = await verifyMember(authHeaderOf(event));

    // ログインユーザー or ゲストの判定
    let user_id: string;
    let buyerEmail: string;
    if (member) {
      user_id = member.sub;
      buyerEmail = member.email || email || '';
      if (!buyerEmail) return badRequest('email required');
    } else {
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badRequest('email_invalid');
      user_id = `guest:${emailHash(email)}`;
      buyerEmail = email;
    }

    // 商品取得
    const prodRes = await docClient.send(
      new GetCommand({ TableName: PRODUCTS_TABLE, Key: { product_id } }),
    );
    const product = prodRes.Item as VideoProduct | undefined;
    if (!product || !product.published) return notFound('product');

    // 在庫事前チェック: 未割当トークンが無ければ決済インボイスを発行しない。
    // (在庫 0 のまま決済 → 支払い完了後に token exhausted で failed → 返金対応、を防ぐ)
    if (!(await hasAvailableToken(product_id))) return conflict('sold_out');

    const order_id = randomUUID();
    const now = new Date().toISOString();

    // クーポン適用(任意)。金額は必ずサーバ側で決定する(クライアント送信の割引率は信用しない)。
    let finalAmount = product.price_jpy;
    let appliedCoupon: string | null = null;
    let couponPercent = 0;
    let discountJpy = 0;
    if (coupon_code) {
      const coupon = await getCoupon(coupon_code);
      if (!coupon) return badRequest('coupon_invalid');
      const v = validateCoupon(coupon, product_id, now);
      if (!v.ok) return conflict(v.reason ?? 'coupon_invalid');
      couponPercent = coupon.discount_percent;
      finalAmount = applyDiscount(product.price_jpy, couponPercent);
      discountJpy = product.price_jpy - finalAmount;
      // 総利用上限を原子的に予約(超過なら失敗)
      if (!(await reserveRedemption(coupon_code, now))) return conflict('coupon_exhausted');
      appliedCoupon = coupon_code;
    }

    // 予約済みクーポン枠は、正常完了に到達しなかった全経路(早期 return / 例外)で必ず戻す。
    let redemptionCommitted = false;
    try {
      const baseOrder = {
        order_id,
        user_id,
        email: buyerEmail,
        product_id,
        token_id: null,
        price_jpy: finalAmount,
        original_price_jpy: product.price_jpy,
        coupon_code: appliedCoupon,
        discount_jpy: discountJpy,
        created_at: now,
        paid_at: null,
      };

      // 無料フルフィルは「100%クーポン適用時」のみ許可する。
      // 0円商品や端数0化(例 ¥49×99%→0)で決済バイパス経路に落ちるのを防ぐ。
      const isFullFree = appliedCoupon !== null && couponPercent === 100;
      if (finalAmount <= 0 && !isFullFree) {
        return badRequest('invalid_amount');
      }

      // 100%割引 = 無料。NOWPayments を経由せず即フルフィル(トークン割当 + DLメール)。
      if (isFullFree) {
        const order: Order = {
          ...baseOrder,
          price_crypto: '',
          currency: '',
          nowpayments_payment_id: 'free',
          status: 'pending',
        };
        await docClient.send(new PutCommand({ TableName: ORDERS_TABLE, Item: order }));

        const result = await fulfillPaidOrder(order);
        if (!result.ok) return conflict('sold_out'); // finally が予約を戻す
        redemptionCommitted = true;
        return ok({ order_id, free: true, complete_url: result.downloadPageUrl });
      }

      // 少額割れガード(NOWPayments 最低取引額割れによる 500 を防ぐ)
      if (finalAmount < MIN_INVOICE_JPY) {
        return conflict('amount_too_small');
      }

      // オーバーセル防止: 決済前に在庫トークンを1本「予約」して確保する。
      // これ以降の checkout からこの1本は見えなくなる。決済失敗/期限切れで解放される。
      const reserved = await reserveToken({ product_id, order_id });
      if (!reserved) return conflict('sold_out'); // 直前に売り切れた

      // 自前決済ページを使うので支払い通貨は必須(NOWPayments /v1/payment が要求)。
      // フロントのプルダウンは ltc/btc のみ。念のためサーバ側でも検証する。
      const payCur = (pay_currency || '').toLowerCase();
      if (payCur !== 'ltc' && payCur !== 'btc') return badRequest('unsupported_currency');

      try {
        // 注文を先に(pending・予約トークン付きで)書く。決済作成前に注文を永続化して
        // 「支払える送金先はあるのに注文レコードが無い」状態を避ける。
        const pendingOrder: Order = {
          ...baseOrder,
          token_id: reserved.token_id,
          price_crypto: '',
          currency: payCur,
          nowpayments_payment_id: '',
          status: 'pending',
        };
        await docClient.send(new PutCommand({ TableName: ORDERS_TABLE, Item: pendingOrder }));

        // 完了(=決済)ページ用の署名トークン(ゲストが自注文を get-order できるように)
        const accessToken = await signOrderToken(order_id);

        // NOWPayments 直接決済を作成(送金先アドレス・数量を受け取り uraneko 上で表示)
        const payment = await createPayment({
          price_amount: finalAmount,
          price_currency: 'jpy',
          pay_currency: payCur,
          order_id,
          order_description: product.title,
          ipn_callback_url: `${API_BASE_URL}/webhooks/nowpayments`,
        });

        await docClient.send(
          new UpdateCommand({
            TableName: ORDERS_TABLE,
            Key: { order_id },
            UpdateExpression:
              'SET nowpayments_payment_id = :pid, price_crypto = :pc, currency = :cur, ' +
              'pay_address = :addr, pay_amount = :amt, pay_currency = :pcur, pay_network = :net, pay_valid_until = :vu',
            ExpressionAttributeValues: {
              ':pid': payment.payment_id,
              ':pc': `${payment.pay_amount} ${payment.pay_currency}`.trim(),
              ':cur': payment.pay_currency,
              ':addr': payment.pay_address,
              ':amt': payment.pay_amount,
              ':pcur': payment.pay_currency,
              ':net': payment.network ?? payment.pay_currency,
              ':vu': payment.valid_until ?? null,
            },
          }),
        );
        redemptionCommitted = true;
        // 決済ページ(=完了ページ)へ遷移させる。送金情報は get-order から取得する。
        return ok({ order_id, complete_url: `${SITE_BASE_URL}/order/${order_id}/complete?token=${accessToken}` });
      } catch (e) {
        // 決済作成等に失敗 → 予約トークンを在庫へ戻す(オーバーセル防止の予約を確実に解放)
        await releaseReservedToken(reserved.token_id, order_id);
        throw e;
      }
    } finally {
      if (appliedCoupon && !redemptionCommitted) await releaseRedemption(appliedCoupon);
    }
  } catch (err) {
    console.error('checkout error:', err);
    return serverError();
  }
}
