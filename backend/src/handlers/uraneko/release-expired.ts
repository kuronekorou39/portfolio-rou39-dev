import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../lib/dynamo';
import { listExpiredReservations, releaseReservedToken } from '../../lib/uraneko/token-claim';
import { releaseRedemption } from '../../lib/uraneko/coupon';
import type { Order } from '../../lib/uraneko/types';

const ORDERS_TABLE = process.env.ORDERS_TABLE!;

/**
 * 期限切れの予約トークンを在庫へ戻す(EventBridge から定期実行)。
 * checkout で予約したまま支払われず(=放置カート)期限切れになった reserved トークンを
 * unassigned に戻し、対応する注文を expired にする。支払い済み(paid)注文の予約は対象外。
 */
export async function handler(): Promise<{ released: number }> {
  const now = new Date().toISOString();
  const expired = await listExpiredReservations(now);
  let released = 0;
  for (const t of expired) {
    if (!t.order_id) continue;
    const order = (
      await docClient.send(new GetCommand({ TableName: ORDERS_TABLE, Key: { order_id: t.order_id } }))
    ).Item as Order | undefined;

    // 予約(reserved)かつ期限切れのトークンは無条件で在庫へ戻す。releaseReservedToken は
    // 「status=reserved かつ order_id 一致」の条件付きなので、正常に assigned 済みなら no-op。
    // 注文が既に paid でも、その確定は別トークンで行われている(=この予約は孤児)ため、
    // ここで解放しないと reserved# のまま永久に在庫から消える。必ず解放する。
    await releaseReservedToken(t.token_id, t.order_id);

    // 未確定の注文だけ expired にする。pending/underpaid のみを対象にし、
    // confirming(先行受け渡し済み)/ paid は絶対に降格させない
    // (confirming の late-payment 復活と release-expired が競合しても壊れないように)。
    if (order) {
      let transitioned = false;
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: ORDERS_TABLE,
            Key: { order_id: t.order_id },
            ConditionExpression: '#s IN (:pending, :underpaid)',
            UpdateExpression: 'SET #s = :expired',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: {
              ':expired': 'expired',
              ':pending': 'pending',
              ':underpaid': 'underpaid',
            },
          }),
        );
        transitioned = true;
      } catch (err: unknown) {
        if ((err as { name?: string })?.name !== 'ConditionalCheckFailedException') throw err;
      }
      // 未確定のまま失効 → 消費したクーポン枠を返却する(この遷移で1回だけ実行される)。
      if (transitioned && order.coupon_code) await releaseRedemption(order.coupon_code);
    }
    released++;
  }
  if (released) console.log(`release-expired: released ${released} reservation(s)`);
  return { released };
}
