import { GetCommand, UpdateCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../dynamo';
import { claimToken, releaseToken, releaseReservedToken } from './token-claim';
import { sendDownloadEmail } from './email';
import { signOrderToken } from './order-token';
import type { Order, OrderStatus, VideoProduct, VideoToken } from './types';

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

// 受け渡し(confirming/paid)へ前進を許可する遷移元。
// expired/failed も含めるのは「invoice 期限切れ/一時失敗の後に入金が届いた」late payment を
// 取りこぼさず受け渡すため(webhook が paid-after-terminal を別途アラートする)。
// paid(確定済み=二重処理防止)と cancelled(購入者の明示的取消=返金領域)は含めない。
const FORWARD_FROM: OrderStatus[] = ['pending', 'confirming', 'underpaid', 'expired', 'failed'];

/**
 * 注文ステータスを条件付きで前進させる(降格・終端からの復活を防ぐ)。
 * 戻り値: この呼び出しが実際に遷移させたら true、条件不成立(既に別状態)なら false。
 */
async function advanceOrderStatus(
  order_id: string,
  target: OrderStatus,
  allowedFrom: OrderStatus[],
  opts: { setPaidAt?: boolean; tokenId?: string } = {},
): Promise<boolean> {
  const values: Record<string, unknown> = { ':t': target };
  const sets = ['#s = :t'];
  allowedFrom.forEach((s, i) => {
    values[`:a${i}`] = s;
  });
  const cond = `#s IN (${allowedFrom.map((_, i) => `:a${i}`).join(', ')})`;
  if (opts.setPaidAt) {
    values[':p'] = new Date().toISOString();
    sets.push('paid_at = :p');
  }
  if (opts.tokenId) {
    values[':tok'] = opts.tokenId;
    sets.push('token_id = :tok');
  }
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: ORDERS_TABLE,
        Key: { order_id },
        ConditionExpression: cond,
        UpdateExpression: 'SET ' + sets.join(', '),
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: values,
      }),
    );
    return true;
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

/**
 * 注文に在庫トークンを割り当て(assigned)つつ、注文ステータスを target まで前進させる。
 * confirming(先行受け渡し)/ paid(最終確定)双方から呼ぶ共通処理。メールは送らない。
 *
 * 通常経路: checkout で予約(reserved)したトークンを、注文の前進とアトミック(TransactWrite)に
 *   assigned へ確定する。IPN の並行/再送でも二重割当しない(冪等)。
 * 既割当経路: 既に自注文へ assigned 済み(confirming で配信済み → paid へ昇格 等)なら、
 *   注文ステータスだけを前進させる。
 * フォールバック/無料経路: 予約が失効・再割当された or token_id が無い(無料)場合は新規 claim。
 *
 * @returns transitioned = この呼び出しが target への遷移を実際に行ったか(paid のメール1回性に使う)
 */
async function assignAndAdvance(
  order: Order,
  target: 'confirming' | 'paid',
): Promise<{ ok: boolean; reason?: string; token_id?: string; transitioned: boolean }> {
  const setPaidAt = target === 'paid';

  if (order.token_id) {
    const tok = (
      await docClient.send(
        new GetCommand({
          TableName: TOKENS_TABLE,
          Key: { token_id: order.token_id },
          ConsistentRead: true,
        }),
      )
    ).Item as VideoToken | undefined;

    // 既に自注文へ割当済み(=配信済み)→ 注文ステータスだけ前進
    if (tok && tok.status === 'assigned' && tok.order_id === order.order_id) {
      const transitioned = await advanceOrderStatus(order.order_id, target, FORWARD_FROM, {
        setPaidAt,
      });
      return { ok: true, token_id: order.token_id, transitioned };
    }

    // 予約中(自注文)→ 予約トークンを assigned に確定しつつ注文を前進(アトミック)
    if (tok && tok.status === 'reserved' && tok.order_id === order.order_id) {
      const now = new Date().toISOString();
      const orderValues: Record<string, unknown> = { ':t': target };
      const orderSets = ['#s = :t'];
      FORWARD_FROM.forEach((s, i) => {
        orderValues[`:a${i}`] = s;
      });
      if (setPaidAt) {
        orderValues[':p'] = now;
        orderSets.push('paid_at = :p');
      }
      try {
        await docClient.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
                  TableName: ORDERS_TABLE,
                  Key: { order_id: order.order_id },
                  ConditionExpression: `#s IN (${FORWARD_FROM.map((_, i) => `:a${i}`).join(', ')})`,
                  UpdateExpression: 'SET ' + orderSets.join(', '),
                  ExpressionAttributeNames: { '#s': 'status' },
                  ExpressionAttributeValues: orderValues,
                },
              },
              {
                Update: {
                  TableName: TOKENS_TABLE,
                  Key: { token_id: order.token_id },
                  ConditionExpression: '#s = :reserved AND order_id = :o',
                  UpdateExpression:
                    'SET #s = :assigned, status_created_at = :sca, assigned_to = :u, assigned_at = :ts REMOVE reserved_until',
                  ExpressionAttributeNames: { '#s': 'status' },
                  ExpressionAttributeValues: {
                    ':reserved': 'reserved',
                    ':assigned': 'assigned',
                    ':sca': `assigned#${tok.created_at}`,
                    ':u': order.user_id,
                    ':ts': now,
                    ':o': order.order_id,
                  },
                },
              },
            ],
          }),
        );
        return { ok: true, token_id: order.token_id, transitioned: true };
      } catch (err: unknown) {
        if ((err as { name?: string })?.name !== 'TransactionCanceledException') throw err;
        // 条件失敗: 注文が既に target/paid か、予約が失効・再割当された。
        // ConsistentRead で勝者の commit 直後を確実に観測し、フォールバックの二重 claim を防ぐ。
        const cur = (
          await docClient.send(
            new GetCommand({
              TableName: ORDERS_TABLE,
              Key: { order_id: order.order_id },
              ConsistentRead: true,
            }),
          )
        ).Item as Order | undefined;
        if (cur && (cur.status === 'paid' || cur.status === target) && cur.token_id) {
          return { ok: true, token_id: cur.token_id, transitioned: false };
        }
        // 予約が孤児化(reserved# のまま)していれば在庫へ戻してからフォールバック
        await releaseReservedToken(order.token_id, order.order_id);
      }
    }
    // else: token が自注文でない(失効・他注文が再予約)→ フォールバックで新規 claim
  }

  // フォールバック / 無料経路: 新規トークンを claim して注文を前進
  const token = await claimToken({
    product_id: order.product_id,
    user_id: order.user_id,
    order_id: order.order_id,
  });
  if (!token) {
    // 在庫枯渇。既に配信/確定済みでなければ failed にする(webhook が検知通知)。
    await advanceOrderStatus(order.order_id, 'failed', FORWARD_FROM).catch(() => false);
    console.error(
      'FULFILL FAILED (manual action needed): order',
      order.order_id,
      'product',
      order.product_id,
    );
    return { ok: false, reason: 'token_exhausted', transitioned: false };
  }
  const transitioned = await advanceOrderStatus(order.order_id, target, FORWARD_FROM, {
    setPaidAt,
    tokenId: token.token_id,
  });
  if (!transitioned) {
    // 別実行が既に確定/配信 → claim したトークンを在庫へ戻す(リーク防止)
    await releaseToken(token.token_id, token.created_at, order.order_id);
    return { ok: true, reason: 'already_fulfilled', transitioned: false };
  }
  return { ok: true, token_id: token.token_id, transitioned: true };
}

function downloadPageUrlFor(order_id: string, accessToken: string): string {
  return `${SITE_BASE_URL}/order/${order_id}/complete?token=${accessToken}`;
}

/**
 * 先行受け渡し(0-conf 検知 = NOWPayments confirming)。
 * 在庫トークンを割り当てて完了ページ/署名リンクからダウンロード可能にする。
 * 控えメールはまだ送らない(最終確認 = finalizeOrder で送る)。
 */
export async function deliverOrder(order: Order): Promise<FulfillResult> {
  const r = await assignAndAdvance(order, 'confirming');
  if (!r.ok) return { ok: false, reason: r.reason };
  const accessToken = await signOrderToken(order.order_id);
  return {
    ok: true,
    token_id: r.token_id,
    accessToken,
    downloadPageUrl: downloadPageUrlFor(order.order_id, accessToken),
  };
}

/**
 * 最終確定(NOWPayments confirmed/finished/sending、または100%クーポン無料)。
 * トークン割当を確定し注文を paid にする。この呼び出しで初めて paid へ遷移した時だけ
 * 控えメールを1回送る(再送/順不同 IPN で二重送信しない)。
 */
export async function finalizeOrder(order: Order): Promise<FulfillResult> {
  const r = await assignAndAdvance(order, 'paid');
  if (!r.ok) return { ok: false, reason: r.reason };
  const accessToken = await signOrderToken(order.order_id);
  const downloadPageUrl = downloadPageUrlFor(order.order_id, accessToken);

  if (r.transitioned) {
    const prod = await docClient.send(
      new GetCommand({ TableName: PRODUCTS_TABLE, Key: { product_id: order.product_id } }),
    );
    const title = (prod.Item as VideoProduct | undefined)?.title ?? order.product_id;
    try {
      await sendDownloadEmail({
        to: order.email,
        productTitle: title,
        orderId: order.order_id,
        downloadPageUrl,
      });
    } catch (sesErr) {
      // メール失敗は paid 成立を妨げない(完了ページ/署名リンクから取得できる)
      console.error('SES send failed (order still paid):', sesErr);
    }
  }
  return { ok: true, token_id: r.token_id, accessToken, downloadPageUrl };
}

// 後方互換 / 無料(100%クーポン)経路: 即 paid + 控えメール。checkout から利用。
export const fulfillPaidOrder = finalizeOrder;
