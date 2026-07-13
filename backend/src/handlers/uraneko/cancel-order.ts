import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../lib/dynamo';
import { ok, badRequest, notFound, forbidden, conflict, serverError } from '../../lib/response';
import { verifyOrderToken } from '../../lib/uraneko/order-token';
import { verifyMember, authHeaderOf } from '../../lib/uraneko/member-auth';
import { releaseReservedToken } from '../../lib/uraneko/token-claim';
import { releaseRedemption } from '../../lib/uraneko/coupon';
import type { Order } from '../../lib/uraneko/types';

const ORDERS_TABLE = process.env.ORDERS_TABLE!;

/**
 * 未払い(pending)の注文を購入者自身がキャンセルする。
 * 予約中の在庫トークンを即座に在庫へ戻し、注文を cancelled にする。
 *
 * - 認可は get-order と同じ(会員の Cognito sub 一致 or 署名済み注文トークン一致)。
 * - confirming(入金検知済み=送金済み)はキャンセル不可。paid/failed/expired/cancelled は冪等。
 * - order を pending 限定の条件付きで cancelled にしてからトークンを解放する(paid への競合を防ぐ)。
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const order_id = event.pathParameters?.order_id;
    if (!order_id) return badRequest('order_id required');

    const res = await docClient.send(
      new GetCommand({ TableName: ORDERS_TABLE, Key: { order_id }, ConsistentRead: true }),
    );
    const order = res.Item as Order | undefined;
    if (!order) return notFound();

    // 認可: 会員(sub 一致)or 署名済み注文トークン(ゲストのメールリンク由来)
    const member = await verifyMember(authHeaderOf(event));
    const body = (() => {
      try {
        return JSON.parse(event.body || '{}') as { token?: string };
      } catch {
        return {};
      }
    })();
    const token = body.token || event.queryStringParameters?.token;

    let authorized = false;
    if (member && member.sub === order.user_id) authorized = true;
    if (!authorized && token && (await verifyOrderToken(token)) === order_id) authorized = true;
    if (!authorized) return forbidden('not_authorized');

    // 入金処理中は送金済みのためキャンセル不可
    if (order.status === 'confirming') return conflict('payment_in_progress');
    // 既に終端(paid/failed/expired/cancelled)なら現状を返す(冪等)
    if (order.status !== 'pending') {
      return ok({ order_id, status: order.status, cancelled: order.status === 'cancelled' });
    }

    // pending → cancelled(paid への競合は条件で弾く)
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: ORDERS_TABLE,
          Key: { order_id },
          ConditionExpression: '#s = :pending',
          UpdateExpression: 'SET #s = :cancelled',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':pending': 'pending', ':cancelled': 'cancelled' },
        }),
      );
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'ConditionalCheckFailedException') {
        // 競合で pending でなくなった(paid 等)→ 現状を返す
        const cur = (
          await docClient.send(
            new GetCommand({ TableName: ORDERS_TABLE, Key: { order_id }, ConsistentRead: true }),
          )
        ).Item as Order | undefined;
        return ok({ order_id, status: cur?.status ?? 'unknown', cancelled: false });
      }
      throw err;
    }

    // キャンセル確定後に予約トークンを在庫へ戻す(reserved かつ当該注文のみ。assigned なら no-op)
    if (order.token_id) await releaseReservedToken(order.token_id, order_id);
    // 消費したクーポン枠も返却する(pending→cancelled が成立したこの経路で1回だけ)
    if (order.coupon_code) await releaseRedemption(order.coupon_code);

    return ok({ order_id, status: 'cancelled', cancelled: true });
  } catch (err) {
    console.error('cancel-order error:', err);
    return serverError();
  }
}
