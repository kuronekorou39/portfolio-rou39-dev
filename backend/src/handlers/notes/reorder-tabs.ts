import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ok, badRequest, notFound, conflict, forbidden, tooManyRequests, serverError } from '../../lib/response';
import { noStore } from '../../lib/notes/http';
import { passesOriginCheck } from '../../lib/notes/origin';
import { resolveTokenThrottled, modeOf } from '../../lib/notes/tokens';
import { pinGateResponse } from '../../lib/notes/pin';
import { reorderTabs } from '../../lib/notes/tabs';
import { MAX_TABS_PER_MEMO, MIN_SAVE_INTERVAL_MS } from '../../lib/notes/limits';

/**
 * POST /m/tabs/reorder — タブの並べ替え。tab_id の配列を受けて position を振り直す。
 *
 * 書き込みなので他の書き込み経路と同じゲートを同じ順で通す
 * (オリジン検証 → スロットル付きトークン解決 → 読み取り専用拒否 → PIN)。
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!(await passesOriginCheck(event))) return noStore(forbidden('forbidden'));
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return noStore(notFound());
    }
    const { token, tab_ids, pin } = body as { token?: unknown; tab_ids?: unknown; pin?: unknown };
    if (typeof token !== 'string' || !token) return noStore(notFound());

    if (!Array.isArray(tab_ids) || tab_ids.length === 0) return noStore(badRequest('tab_ids_required'));
    if (tab_ids.length > MAX_TABS_PER_MEMO) return noStore(badRequest('too_many_tabs'));
    if (!tab_ids.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 64)) {
      return noStore(badRequest('invalid_tab_id'));
    }
    // 同じ tab_id が二度来ると TransactWrite が同一キー重複で落ちるので先に弾く
    if (new Set(tab_ids as string[]).size !== tab_ids.length) return noStore(badRequest('duplicate_tab_id'));

    const resolved = await resolveTokenThrottled(token, 'last_save_ms', MIN_SAVE_INTERVAL_MS);
    if (resolved.kind === 'invalid') return noStore(notFound());
    if (resolved.kind === 'throttled') return noStore(tooManyRequests('save_throttled'));
    if (modeOf(resolved.token) === 'ro') return noStore(forbidden('read_only'));
    const pinResp = await pinGateResponse(resolved.token.memo_id, resolved.token.token_hash, resolved.token, pin);
    if (pinResp) return pinResp;

    const result = await reorderTabs({
      memo_id: resolved.token.memo_id,
      tab_ids: tab_ids as string[],
    });
    // 知らない tab_id が混ざっている = 別端末で削除された等。クライアントは再取得して直す
    if (result.kind === 'not_found') return noStore(conflict('tab_missing'));
    return noStore(ok({ reordered: true }));
  } catch (err) {
    console.error('reorder-tabs error:', err);
    return noStore(serverError());
  }
}
