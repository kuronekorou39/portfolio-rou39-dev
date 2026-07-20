import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ok, badRequest, notFound, forbidden, serverError } from '../../lib/response';
import { setMemoPin, clearMemoPin, isValidPinFormat } from '../../lib/notes/pin';

/**
 * PUT /admin/memos/{memo_id}/pin — メモ画面アクセスに必要な PIN を設定/変更/解除(Cognito 必須)。
 * body { pin: "1234" } で設定、{ pin: null } または pin 省略で解除。
 * PIN は4桁以上の数字(桁数は固定しない)。scrypt でハッシュ保存し、トークン単位の失効ロックで
 * 総当たりを抑止する。桁数の実定義は lib/notes/pin.ts の PIN_MIN_LEN/PIN_MAX_LEN。
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userSub = event.requestContext.authorizer?.claims?.sub as string | undefined;
    if (!userSub) return forbidden('login_required');
    const memo_id = event.pathParameters?.memo_id;
    if (!memo_id) return notFound();

    const body = JSON.parse(event.body || '{}');
    const pin = body.pin;

    if (pin === null || pin === undefined || pin === '') {
      const r = await clearMemoPin({ memo_id, owner_user_id: userSub });
      if (!r.ok) return notFound();
      return ok({ memo_id, has_pin: false });
    }

    if (!isValidPinFormat(pin)) return badRequest('invalid_pin'); // 4桁以上の数字(上限は pin.ts のサニティ値)
    const r = await setMemoPin({ memo_id, owner_user_id: userSub, pin });
    if (!r.ok) return notFound();
    return ok({ memo_id, has_pin: true });
  } catch (err) {
    console.error('admin-set-pin error:', err); // pin は絶対にログしない
    return serverError();
  }
}
