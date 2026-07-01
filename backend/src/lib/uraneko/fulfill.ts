import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../dynamo';
import { claimToken, releaseToken } from './token-claim';
import { sendDownloadEmail } from './email';
import { signOrderToken } from './order-token';
import type { Order, VideoProduct } from './types';

const ORDERS_TABLE = process.env.ORDERS_TABLE!;
const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE!;
const SITE_BASE_URL = process.env.URANEKO_SITE_URL!;

export interface FulfillResult {
  ok: boolean;
  reason?: string;
  token_id?: string;
  accessToken?: string;
  downloadPageUrl?: string;
}

/**
 * 支払い確定済みの注文をフルフィルする:
 *   トークン割当 → order を paid+token_id+paid_at に更新 → 署名トークン発行 → DLメール送信。
 *
 * NOWPayments webhook(暗号決済)と、100%割引クーポンの無料購入経路の両方から呼ばれる共通処理。
 * トークン枯渇時は order を failed にして { ok:false, reason:'token_exhausted' } を返す。
 */
export async function fulfillPaidOrder(order: Order): Promise<FulfillResult> {
  const token = await claimToken({
    product_id: order.product_id,
    user_id: order.user_id,
    order_id: order.order_id,
  });
  if (!token) {
    await docClient.send(
      new UpdateCommand({
        TableName: ORDERS_TABLE,
        Key: { order_id: order.order_id },
        UpdateExpression: 'SET #s = :s',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':s': 'failed' },
      }),
    );
    return { ok: false, reason: 'token_exhausted' };
  }

  const paid_at = new Date().toISOString();
  try {
    // 注文単位で冪等化: token_id 未設定のときだけ確定する。
    // paid 写像 IPN の並行到達 / 5xx 再送で二重フルフィルされても、
    // 勝つのは1実行だけ。負けた実行は自分が claim したトークンを在庫へ戻す。
    await docClient.send(
      new UpdateCommand({
        TableName: ORDERS_TABLE,
        Key: { order_id: order.order_id },
        ConditionExpression: 'attribute_not_exists(token_id)',
        UpdateExpression: 'SET #s = :s, token_id = :t, paid_at = :p',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':s': 'paid', ':t': token.token_id, ':p': paid_at },
      }),
    );
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'ConditionalCheckFailedException') {
      // 別実行が既にこの注文を確定済み → 二重 claim したトークンを在庫へ戻す(在庫喪失防止)
      await releaseToken(token.token_id, token.created_at, order.order_id);
      return { ok: true, reason: 'already_fulfilled' };
    }
    throw err;
  }

  const prod = await docClient.send(
    new GetCommand({ TableName: PRODUCTS_TABLE, Key: { product_id: order.product_id } }),
  );
  const title = (prod.Item as VideoProduct | undefined)?.title ?? order.product_id;

  const accessToken = await signOrderToken(order.order_id);
  const downloadPageUrl = `${SITE_BASE_URL}/order/${order.order_id}/complete?token=${accessToken}`;

  try {
    await sendDownloadEmail({
      to: order.email,
      productTitle: title,
      orderId: order.order_id,
      downloadPageUrl,
    });
  } catch (sesErr) {
    console.error('SES send failed (order still paid):', sesErr);
    // 支払いは成立しているのでフルフィルは成功扱い(購入履歴 / complete_url から取得可)
  }

  return { ok: true, token_id: token.token_id, accessToken, downloadPageUrl };
}
