import { GetCommand, UpdateCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../dynamo';
import { claimToken, releaseToken, releaseReservedToken } from './token-claim';
import { sendDownloadEmail } from './email';
import { signOrderToken } from './order-token';
import type { Order, VideoProduct } from './types';

const ORDERS_TABLE = process.env.ORDERS_TABLE!;
const TOKENS_TABLE = process.env.TOKENS_TABLE!;
const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE!;
const SITE_BASE_URL = process.env.URANEKO_SITE_URL!;

export interface FulfillResult {
  ok: boolean;
  reason?: string;
  token_id?: string;
  accessToken?: string;
  downloadPageUrl?: string;
}

// 確定後の共通処理: DLメール送信 + 受領URL生成。SES 失敗は握らず paid 成立扱い。
async function finishFulfillment(order: Order, tokenId: string): Promise<FulfillResult> {
  const prod = await docClient.send(
    new GetCommand({ TableName: PRODUCTS_TABLE, Key: { product_id: order.product_id } }),
  );
  const title = (prod.Item as VideoProduct | undefined)?.title ?? order.product_id;
  const accessToken = await signOrderToken(order.order_id);
  const downloadPageUrl = `${SITE_BASE_URL}/order/${order.order_id}/complete?token=${accessToken}`;
  try {
    await sendDownloadEmail({ to: order.email, productTitle: title, orderId: order.order_id, downloadPageUrl });
  } catch (sesErr) {
    console.error('SES send failed (order still paid):', sesErr);
  }
  return { ok: true, token_id: tokenId, accessToken, downloadPageUrl };
}

/**
 * 支払い確定済み注文をフルフィルする(webhook 決済確定 / 100%クーポン無料の両方から呼ぶ)。
 *
 * 通常経路: checkout で在庫トークンを1本「予約(reserved)」済み(order.token_id にセット)。
 *   order を pending→paid、その予約トークンを reserved→assigned に **アトミック(TransactWrite)**
 *   で確定する。IPN の並行/再送でも paid に遷移できるのは1回だけ=冪等。
 * 予約失効経路: 予約が期限切れで解放/再割当されていた場合、新規に unassigned を claim する。
 * 無料経路: order.token_id は null なので直接 claim する。
 * トークン枯渇時は order を failed にし { ok:false, reason:'token_exhausted' }(webhook が検知通知)。
 */
export async function fulfillPaidOrder(order: Order): Promise<FulfillResult> {
  const paid_at = new Date().toISOString();

  // --- 通常経路: 予約トークンを order paid と同時にアトミック確定 ---
  if (order.token_id) {
    try {
      await docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: ORDERS_TABLE,
                Key: { order_id: order.order_id },
                ConditionExpression: '#s <> :paid',
                UpdateExpression: 'SET #s = :paid, paid_at = :p',
                ExpressionAttributeNames: { '#s': 'status' },
                ExpressionAttributeValues: { ':paid': 'paid', ':p': paid_at },
              },
            },
            {
              Update: {
                TableName: TOKENS_TABLE,
                Key: { token_id: order.token_id },
                ConditionExpression: '#s = :reserved AND order_id = :o',
                UpdateExpression:
                  'SET #s = :assigned, status_created_at = :sca, assigned_to = :u, assigned_at = :t REMOVE reserved_until',
                ExpressionAttributeNames: { '#s': 'status' },
                ExpressionAttributeValues: {
                  ':reserved': 'reserved',
                  ':assigned': 'assigned',
                  ':sca': `assigned#${paid_at}`,
                  ':u': order.user_id,
                  ':t': paid_at,
                  ':o': order.order_id,
                },
              },
            },
          ],
        }),
      );
      return await finishFulfillment(order, order.token_id);
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'TransactionCanceledException') throw err;
      // どちらかの条件失敗。order が既に paid なら冪等(二重確定を防止)。
      // ConsistentRead で「勝者の commit 直後」を確実に観測し、結果整合の読み逃しによる
      // フォールバックの二重 claim を防ぐ。
      const cur = (
        await docClient.send(
          new GetCommand({
            TableName: ORDERS_TABLE,
            Key: { order_id: order.order_id },
            ConsistentRead: true,
          }),
        )
      ).Item as Order | undefined;
      if (cur?.status === 'paid' && cur.token_id) return { ok: true, reason: 'already_fulfilled' };
      // ここに来たのは (a) 予約が失効した (b) 並行競合(TransactionConflict)で Tx が
      // 巻き戻った、のいずれか。予約トークンがまだ当該注文で reserved のままなら在庫へ戻し、
      // reserved# のまま誰も回収しない孤児化(在庫の永久喪失)を防ぐ。既に別状態なら no-op。
      await releaseReservedToken(order.token_id, order.order_id);
    }
  }

  // --- フォールバック / 無料経路: 新規トークンを claim して order を paid に ---
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
        ConditionExpression: '#s <> :paid',
        UpdateExpression: 'SET #s = :failed',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':failed': 'failed', ':paid': 'paid' },
      }),
    ).catch(() => undefined); // 既に paid 等は無視
    console.error('FULFILL FAILED (manual action needed):', 'order', order.order_id, 'product', order.product_id);
    return { ok: false, reason: 'token_exhausted' };
  }
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: ORDERS_TABLE,
        Key: { order_id: order.order_id },
        ConditionExpression: '#s <> :paid',
        UpdateExpression: 'SET #s = :paid, token_id = :t, paid_at = :p',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':paid': 'paid', ':t': token.token_id, ':p': paid_at },
      }),
    );
  } catch (err: unknown) {
    // 別実行が既に確定(CCF)/一時的な並行競合(TransactionConflict 等)いずれの場合も、
    // claim 済みトークンを在庫へ戻してから判断する(戻さないとトークンがリークする)。
    await releaseToken(token.token_id, token.created_at, order.order_id);
    if ((err as { name?: string })?.name === 'ConditionalCheckFailedException') {
      return { ok: true, reason: 'already_fulfilled' };
    }
    throw err;
  }
  return await finishFulfillment(order, token.token_id);
}
