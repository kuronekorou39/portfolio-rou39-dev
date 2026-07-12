import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../lib/dynamo';
import { ok, badRequest, serverError, forbidden } from '../../lib/response';
import { verifyIpnSignature } from '../../lib/uraneko/nowpayments';
import { deliverOrder, finalizeOrder } from '../../lib/uraneko/fulfill';
import { extendReservation, releaseReservedToken } from '../../lib/uraneko/token-claim';
import type { Order, OrderStatus } from '../../lib/uraneko/types';

const ORDERS_TABLE = process.env.ORDERS_TABLE!;

// NOWPayments の payment_status を、こちら側の処理アクションに写像する。
//   deliver   : 入金検知(0-conf)。先行受け渡し(DL可・メールは後で)
//   finalize  : 最終確認完了。paid 確定 + 控えメール
//   underpaid : 支払額不足。自動受け渡しせず管理者対応
//   fail/expire: 失敗・期限切れ
//   ignore    : waiting 等、状態を進めない
type Action = 'deliver' | 'finalize' | 'underpaid' | 'fail' | 'expire' | 'ignore';

function classify(paymentStatus: string): Action {
  switch (paymentStatus) {
    case 'finished':
    case 'confirmed':
    case 'sending':
      return 'finalize';
    case 'confirming':
      return 'deliver';
    case 'partially_paid':
      return 'underpaid';
    case 'failed':
    case 'refunded':
      return 'fail';
    case 'expired':
      return 'expire';
    default:
      return 'ignore';
  }
}

// 受領額が要求額に対して不足しているか。手数料/端数の誤差を 2% 許容する。
// 先行受け渡し(0-conf の confirming)で金額を検証するために使う。
// これ未満の額(ウォレットで極小額を手入力された等)では受け渡さない。
const PAY_TOLERANCE = 0.98;
function isAmountShort(p: { actually_paid?: number | string; pay_amount?: number | string }): boolean {
  const paid = Number(p.actually_paid);
  const expected = Number(p.pay_amount);
  // 判定に必要な数値が無いときは「不足」と断定しない(finished 等は別途 NOWPayments が満額確定済み)。
  if (!Number.isFinite(paid) || !Number.isFinite(expected) || expected <= 0) return false;
  return paid < expected * PAY_TOLERANCE;
}

// 注文ステータスを条件付きで前進させる(降格・終端からの復活を防ぐ)。
async function setOrderStatus(
  order_id: string,
  target: OrderStatus,
  allowedFrom: OrderStatus[],
): Promise<void> {
  const values: Record<string, unknown> = { ':t': target };
  allowedFrom.forEach((s, i) => {
    values[`:a${i}`] = s;
  });
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: ORDERS_TABLE,
        Key: { order_id },
        ConditionExpression: `#s IN (${allowedFrom.map((_, i) => `:a${i}`).join(', ')})`,
        UpdateExpression: 'SET #s = :t',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: values,
      }),
    );
  } catch (err: unknown) {
    if ((err as { name?: string })?.name !== 'ConditionalCheckFailedException') throw err;
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
      actually_paid?: number | string; // 実際に受領した数量
      pay_amount?: number | string; // 要求した数量
    };

    const order_id = payload.order_id;
    const paymentStatus = payload.payment_status;
    if (!order_id || !paymentStatus) return badRequest('malformed payload');

    let action = classify(paymentStatus);

    // 先行受け渡し(0-conf の confirming)の金額検証:
    // confirming は最終確認前で NOWPayments が満額を保証しないため、受領額が不足していれば
    // 配信せず underpaid 扱いにする(ウォレットで金額を小さく手入力された等を防ぐ)。
    // finished/confirmed/sending は NOWPayments が満額確定済みなので信頼する。
    if (action === 'deliver' && isAmountShort(payload)) {
      action = 'underpaid';
    }

    // Order を取得(冪等判定に使うので強整合読み取り。並行/再送 IPN の読み逃しを減らす)
    const res = await docClient.send(
      new GetCommand({ TableName: ORDERS_TABLE, Key: { order_id }, ConsistentRead: true }),
    );
    const order = res.Item as Order | undefined;
    if (!order) return badRequest('order not found');

    // paid は終端。以降の再送/順不同 IPN は無視(降格させない)。
    if (order.status === 'paid' && order.token_id) {
      return ok({ ok: true, already_paid: true });
    }

    // 終端(expired/failed/cancelled)後に入金系 IPN が届いた = late payment。
    // 「支払われたのに無言で何も起きない」を避けるため必ずアラートする。
    // cancelled(購入者の明示的取消)は自動受け渡しせず管理者対応(返金等)。
    // expired/failed は下の deliver/finalize で受け渡しを試みる(FORWARD_FROM が許可)。
    const payingAction = action === 'deliver' || action === 'finalize';
    if (
      payingAction &&
      (order.status === 'expired' || order.status === 'failed' || order.status === 'cancelled')
    ) {
      console.error(
        `PAYMENT ANOMALY [paid-after-${order.status}] (manual action needed) order=${order_id} product=${order.product_id} email=${order.email}`,
      );
      if (order.status === 'cancelled') {
        return ok({ ok: true, status: 'cancelled', note: 'paid_after_cancel' });
      }
    }

    switch (action) {
      case 'deliver': {
        // 先行受け渡し: トークン割当のみ(控えメールは finalize で送る)
        const r = await deliverOrder(order);
        if (!r.ok) {
          console.error(
            'FULFILL FAILED (manual action needed):',
            r.reason,
            'order',
            order_id,
            'product',
            order.product_id,
          );
          return ok({ ok: false, status: 'failed', reason: r.reason });
        }
        return ok({ ok: true, status: 'confirming' });
      }

      case 'finalize': {
        // 最終確定: paid 昇格 + 控えメール(1回)
        const r = await finalizeOrder(order);
        if (!r.ok) {
          console.error(
            'FULFILL FAILED (manual action needed):',
            r.reason,
            'order',
            order_id,
            'product',
            order.product_id,
          );
          return ok({ ok: false, status: 'failed', reason: r.reason });
        }
        return ok({ ok: true, status: 'paid' });
      }

      case 'underpaid': {
        // 支払額不足 → 自動受け渡ししない。pending の注文のみ underpaid にする
        // (confirming で配信済み等には反応しない)。配信前の注文にだけアラート/予約延長する。
        if (order.status !== 'pending') {
          return ok({ ok: true, status: order.status });
        }
        await setOrderStatus(order_id, 'underpaid', ['pending']);
        // 追加送金(top-up)で finished になる余地を残すため、予約は延長しておく。
        if (order.token_id) await extendReservation(order.token_id, order_id);
        console.error(
          `PAYMENT ANOMALY [underpaid] (manual action needed) order=${order_id} product=${order.product_id} email=${order.email} paid=${payload.actually_paid ?? '?'} expected=${payload.pay_amount ?? '?'}`,
        );
        return ok({ ok: true, status: 'underpaid' });
      }

      case 'fail':
      case 'expire': {
        const target: OrderStatus = action === 'fail' ? 'failed' : 'expired';
        if (order.status === 'confirming') {
          // 先行受け渡し済み(DLリンク発行済み)で決済が失敗/期限切れ。受け渡しは取り消せない
          // ため、在庫は戻さず管理者アラートで手動対応する(残高不足・二重支払い等)。
          await setOrderStatus(order_id, target, ['confirming']);
          console.error(
            `PAYMENT ANOMALY [${target}-after-delivery] (manual action needed) order=${order_id} product=${order.product_id} email=${order.email}`,
          );
        } else {
          // 未配信 → 予約トークンを在庫へ戻し、注文を終端化(paid は絶対に降格させない)。
          await setOrderStatus(order_id, target, ['pending', 'underpaid']);
          if (order.token_id) await releaseReservedToken(order.token_id, order_id);
        }
        return ok({ ok: true, status: target });
      }

      case 'ignore':
      default:
        // waiting 等: 状態を進めない
        return ok({ ok: true, status: order.status });
    }
  } catch (err) {
    console.error('webhook error:', err);
    return serverError();
  }
}
