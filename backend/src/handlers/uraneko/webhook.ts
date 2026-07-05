import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../lib/dynamo';
import { ok, badRequest, serverError, forbidden } from '../../lib/response';
import { verifyIpnSignature } from '../../lib/uraneko/nowpayments';
import { fulfillPaidOrder } from '../../lib/uraneko/fulfill';
import type { Order, OrderStatus } from '../../lib/uraneko/types';

const ORDERS_TABLE = process.env.ORDERS_TABLE!;

// NOWPayments payment_status → 自分のOrderStatus
function mapStatus(paymentStatus: string): OrderStatus {
  switch (paymentStatus) {
    case 'finished':
    case 'confirmed':
      return 'paid';
    case 'confirming':
    case 'sending':
    case 'partially_paid':
      return 'confirming';
    case 'failed':
      return 'failed';
    case 'expired':
      return 'expired';
    default:
      return 'pending';
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (event.httpMethod !== 'POST') return badRequest('Unsupported method');

    const rawBody = event.body || '';
    const signature =
      event.headers['x-nowpayments-sig'] ||
      event.headers['X-Nowpayments-Sig'] ||
      event.headers['x-Nowpayments-Sig'] ||
      '';
    if (!signature) return forbidden('missing signature');

    const valid = await verifyIpnSignature(rawBody, signature);
    if (!valid) return forbidden('invalid signature');

    const payload = JSON.parse(rawBody) as {
      payment_id?: number | string;
      payment_status?: string;
      order_id?: string;
      pay_amount?: number;
      pay_currency?: string;
      price_amount?: number;
    };

    const order_id = payload.order_id;
    const paymentStatus = payload.payment_status;
    if (!order_id || !paymentStatus) return badRequest('malformed payload');

    const newStatus = mapStatus(paymentStatus);

    // Orderを取得
    const res = await docClient.send(new GetCommand({ TableName: ORDERS_TABLE, Key: { order_id } }));
    const order = res.Item as Order | undefined;
    if (!order) return badRequest('order not found');

    // 既に paid 済みなら何もしない(webhook 冪等性)
    if (order.status === 'paid' && order.token_id) {
      return ok({ ok: true, already_paid: true });
    }

    // 支払い完了以外はステータスだけ更新。ただし確定済み(paid)は絶対に降格させない
    // (NOWPayments は IPN を再送・順不同配信し得る。paid 後に confirming 等が来ても無視)。
    if (newStatus !== 'paid') {
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: ORDERS_TABLE,
            Key: { order_id },
            UpdateExpression: 'SET #s = :s',
            ConditionExpression: '#s <> :paid',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: { ':s': newStatus, ':paid': 'paid' },
          }),
        );
      } catch (err: unknown) {
        // 既に paid → 降格しない(冪等)。それ以外は再送させる
        if ((err as { name?: string })?.name !== 'ConditionalCheckFailedException') throw err;
      }
      return ok({ ok: true, status: newStatus });
    }

    // 支払い完了: 共通フルフィル(トークン割当 → orders 更新 → DLメール送信)
    const result = await fulfillPaidOrder(order);
    if (!result.ok) {
      // トークン枯渇は在庫補充が必要な恒久失敗。500 で NOWPayments に無限再送させず、
      // 200 で受領して再送を止め、ログで手動対応(在庫補充/返金)を促す。
      console.error(
        'FULFILL FAILED (manual action needed):',
        result.reason,
        'product',
        order.product_id,
        'order',
        order_id,
      );
      return ok({ ok: false, status: 'failed', reason: result.reason });
    }

    return ok({ ok: true, status: 'paid' });
  } catch (err) {
    console.error('webhook error:', err);
    return serverError();
  }
}
