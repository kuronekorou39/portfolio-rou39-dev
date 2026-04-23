import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../lib/dynamo';
import { ok, badRequest, serverError, forbidden } from '../../lib/response';
import { verifyIpnSignature } from '../../lib/uraneko/nowpayments';
import { claimToken } from '../../lib/uraneko/token-claim';
import { sendDownloadEmail } from '../../lib/uraneko/email';
import { signOrderToken } from '../../lib/uraneko/order-token';
import type { Order, OrderStatus, VideoProduct } from '../../lib/uraneko/types';

const ORDERS_TABLE = process.env.ORDERS_TABLE!;
const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE!;
const SITE_BASE_URL = process.env.URANEKO_SITE_URL!;

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

    // 支払い完了以外はステータスだけ更新
    if (newStatus !== 'paid') {
      await docClient.send(
        new UpdateCommand({
          TableName: ORDERS_TABLE,
          Key: { order_id },
          UpdateExpression: 'SET #s = :s',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':s': newStatus },
        }),
      );
      return ok({ ok: true, status: newStatus });
    }

    // 支払い完了: トークン割当 → orders 更新 → メール送信
    const token = await claimToken({
      product_id: order.product_id,
      user_id: order.user_id,
      order_id,
    });
    if (!token) {
      console.error('Token exhausted for product', order.product_id, 'order', order_id);
      await docClient.send(
        new UpdateCommand({
          TableName: ORDERS_TABLE,
          Key: { order_id },
          UpdateExpression: 'SET #s = :s',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':s': 'failed' },
        }),
      );
      return serverError('token exhausted');
    }

    const paid_at = new Date().toISOString();
    await docClient.send(
      new UpdateCommand({
        TableName: ORDERS_TABLE,
        Key: { order_id },
        UpdateExpression: 'SET #s = :s, token_id = :t, paid_at = :p',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':s': 'paid',
          ':t': token.token_id,
          ':p': paid_at,
        },
      }),
    );

    // 商品タイトル取得(メール用)
    const prod = await docClient.send(
      new GetCommand({ TableName: PRODUCTS_TABLE, Key: { product_id: order.product_id } }),
    );
    const product = prod.Item as VideoProduct | undefined;
    const title = product?.title ?? order.product_id;

    // メール経由の注文アクセストークンを署名
    const accessToken = await signOrderToken(order_id);
    const downloadPageUrl = `${SITE_BASE_URL}/order/${order_id}/complete?token=${accessToken}`;

    try {
      await sendDownloadEmail({
        to: order.email,
        productTitle: title,
        orderId: order_id,
        downloadPageUrl,
      });
    } catch (sesErr) {
      console.error('SES send failed (order still paid):', sesErr);
      // 支払いは成立しているので 200 を返す。ユーザーは購入履歴から取得可
    }

    return ok({ ok: true, status: 'paid' });
  } catch (err) {
    console.error('webhook error:', err);
    return serverError();
  }
}
