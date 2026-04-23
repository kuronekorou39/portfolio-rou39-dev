import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../lib/dynamo';
import { ok, forbidden, serverError } from '../../lib/response';
import type { Order } from '../../lib/uraneko/types';

const ORDERS_TABLE = process.env.ORDERS_TABLE!;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userSub = event.requestContext.authorizer?.claims?.sub as string | undefined;
    if (!userSub) return forbidden('login_required');

    const res = await docClient.send(
      new QueryCommand({
        TableName: ORDERS_TABLE,
        IndexName: 'by_user',
        KeyConditionExpression: 'user_id = :u',
        ExpressionAttributeValues: { ':u': userSub },
        ScanIndexForward: false, // 新しい順
        Limit: 50,
      }),
    );

    const items = ((res.Items as Order[] | undefined) ?? []).map((o) => ({
      order_id: o.order_id,
      product_id: o.product_id,
      price_jpy: o.price_jpy,
      currency: o.currency,
      status: o.status,
      created_at: o.created_at,
      paid_at: o.paid_at,
    }));

    return ok(items);
  } catch (err) {
    console.error('my-orders error:', err);
    return serverError();
  }
}
