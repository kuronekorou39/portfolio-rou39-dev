import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { createHash, randomUUID } from 'crypto';
import { docClient } from '../../lib/dynamo';
import { ok, badRequest, notFound, serverError } from '../../lib/response';
import { createInvoice } from '../../lib/uraneko/nowpayments';
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
    const { product_id, email, pay_currency } = body as {
      product_id?: string;
      email?: string;
      pay_currency?: string;
    };
    if (!product_id) return badRequest('product_id required');

    const userSub = event.requestContext.authorizer?.claims?.sub as string | undefined;
    const userEmailFromClaim = event.requestContext.authorizer?.claims?.email as string | undefined;

    // ログインユーザー or ゲストの判定
    let user_id: string;
    let buyerEmail: string;
    if (userSub) {
      user_id = userSub;
      buyerEmail = userEmailFromClaim ?? (email ?? '');
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

    const order_id = randomUUID();
    const now = new Date().toISOString();

    // NOWPayments invoice 作成
    const invoice = await createInvoice({
      price_amount: product.price_jpy,
      price_currency: 'jpy',
      pay_currency: pay_currency,
      order_id,
      order_description: product.title,
      ipn_callback_url: `${API_BASE_URL}/webhooks/nowpayments`,
      success_url: `${SITE_BASE_URL}/order/${order_id}/complete`,
      cancel_url: `${SITE_BASE_URL}/product/${product_id}`,
    });

    const order: Order = {
      order_id,
      user_id,
      email: buyerEmail,
      product_id,
      token_id: null,
      price_jpy: product.price_jpy,
      price_crypto: invoice.pay_amount != null ? `${invoice.pay_amount} ${invoice.pay_currency ?? ''}`.trim() : '',
      currency: invoice.pay_currency ?? pay_currency ?? '',
      nowpayments_payment_id: invoice.id,
      status: 'pending',
      created_at: now,
      paid_at: null,
    };

    await docClient.send(new PutCommand({ TableName: ORDERS_TABLE, Item: order }));

    return ok({
      order_id,
      invoice_url: invoice.invoice_url,
    });
  } catch (err) {
    console.error('checkout error:', err);
    return serverError();
  }
}
