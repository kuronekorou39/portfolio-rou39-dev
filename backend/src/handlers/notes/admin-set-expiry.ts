import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ok, badRequest, notFound, forbidden, serverError } from '../../lib/response';
import { setTokenExpiry } from '../../lib/notes/tokens';
import type { TokenMode } from '../../lib/notes/types';

// 有効期限のサニティ上限(約10年先まで)。極端な未来日時を弾く。
const MAX_EXPIRY_AHEAD_MS = 10 * 365 * 24 * 60 * 60 * 1000;

/**
 * PUT /admin/memos/{memo_id}/expiry — 秘密URLの有効期限を設定/延長/クリア(Cognito 必須)。
 *
 * body: { kind: 'rw' | 'ro', expires_at: ISO8601文字列 | null }
 *   - expires_at=未来のISO日時 → その時刻でURLが期限切れになる(開けなくなる)
 *   - expires_at=null → 無期限化(=期限切れからの復活)
 * revoke と違い可逆で、token_hash を変えない = 同じURLのまま有効/期限切れを往復できる。
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userSub = event.requestContext.authorizer?.claims?.sub as string | undefined;
    if (!userSub) return forbidden('login_required');
    const memo_id = event.pathParameters?.memo_id;
    if (!memo_id) return notFound();

    let body: { kind?: unknown; expires_at?: unknown };
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return badRequest('invalid_params');
    }
    const mode: TokenMode = body.kind === 'ro' ? 'ro' : 'rw';

    let expiresAtMs: number | null;
    if (body.expires_at === null || body.expires_at === undefined) {
      expiresAtMs = null; // 無期限化(復活)
    } else if (typeof body.expires_at === 'string') {
      const t = Date.parse(body.expires_at);
      if (Number.isNaN(t)) return badRequest('invalid_expiry');
      const now = Date.now();
      if (t <= now) return badRequest('expiry_in_past'); // 有効期限は未来のみ(即失効は revoke を使う)
      if (t > now + MAX_EXPIRY_AHEAD_MS) return badRequest('expiry_too_far');
      expiresAtMs = t;
    } else {
      return badRequest('invalid_expiry');
    }

    const result = await setTokenExpiry({
      memo_id,
      owner_user_id: userSub,
      mode,
      expires_at_ms: expiresAtMs,
    });
    if (!result.ok) return notFound();

    return ok({
      memo_id,
      kind: mode,
      expires_at: expiresAtMs === null ? null : new Date(expiresAtMs).toISOString(),
    });
  } catch (err) {
    console.error('admin-set-expiry error:', err);
    return serverError();
  }
}
