import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ok, notFound, conflict, forbidden, tooManyRequests, serverError } from '../../lib/response';
import { noStore } from '../../lib/notes/http';
import { resolveTokenThrottled, modeOf } from '../../lib/notes/tokens';
import { pinGateResponse } from '../../lib/notes/pin';
import { deleteTab } from '../../lib/notes/tabs';
import { MIN_SAVE_INTERVAL_MS } from '../../lib/notes/limits';

/** POST /m/tabs/delete — タブ削除(最後の1枚は不可)。 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return noStore(notFound());
    }
    const { token, tab_id, pin } = body as { token?: unknown; tab_id?: unknown; pin?: unknown };
    if (typeof token !== 'string' || !token) return noStore(notFound());
    if (typeof tab_id !== 'string' || !tab_id) return noStore(notFound());

    const resolved = await resolveTokenThrottled(token, 'last_save_ms', MIN_SAVE_INTERVAL_MS);
    if (resolved.kind === 'invalid') return noStore(notFound());
    if (resolved.kind === 'throttled') return noStore(tooManyRequests('save_throttled'));
    if (modeOf(resolved.token) === 'ro') return noStore(forbidden('read_only'));
    const pinResp = await pinGateResponse(resolved.token.memo_id, resolved.token.token_hash, resolved.token, pin);
    if (pinResp) return pinResp;

    const result = await deleteTab({ memo_id: resolved.token.memo_id, tab_id });
    if (result.kind === 'last_tab') return noStore(conflict('last_tab'));
    return noStore(ok({ deleted: true }));
  } catch (err) {
    console.error('delete-tab error:', err);
    return noStore(serverError());
  }
}
