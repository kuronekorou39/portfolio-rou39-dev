import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ok, badRequest, notFound, conflict, forbidden, tooManyRequests, serverError } from '../../lib/response';
import { noStore } from '../../lib/notes/http';
import { passesOriginCheck } from '../../lib/notes/origin';
import { resolveTokenThrottled, modeOf } from '../../lib/notes/tokens';
import { pinGateResponse } from '../../lib/notes/pin';
import { createTab } from '../../lib/notes/tabs';
import { MIN_SAVE_INTERVAL_MS } from '../../lib/notes/limits';

/** POST /m/tabs/create — タブ追加(上限は memos.tab_count の条件付きカウンタで強制)。 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!(await passesOriginCheck(event))) return noStore(forbidden('forbidden'));
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return noStore(notFound());
    }
    const { token, title, pin, tab_id, position } = body as {
      token?: unknown; title?: unknown; pin?: unknown; tab_id?: unknown; position?: unknown;
    };
    if (typeof token !== 'string' || !token) return noStore(notFound());
    const tabTitle = typeof title === 'string' ? title : '';
    if (tabTitle.length > 200) return noStore(badRequest('title_too_long'));

    // クライアント採番の tab_id(楽観追加用)。UUID 形式だけ受ける。
    // 未指定ならサーバが採番する(旧クライアント互換)。
    let tabId: string | undefined;
    if (tab_id !== undefined) {
      if (typeof tab_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tab_id)) {
        return noStore(badRequest('invalid_tab_id'));
      }
      tabId = tab_id;
    }
    const tabPosition = typeof position === 'number' && Number.isFinite(position) ? position : undefined;

    // 作成も書き込みなので保存と同じスロットル窓を消費する
    const resolved = await resolveTokenThrottled(token, 'last_save_ms', MIN_SAVE_INTERVAL_MS);
    if (resolved.kind === 'invalid') return noStore(notFound());
    if (resolved.kind === 'throttled') return noStore(tooManyRequests('save_throttled'));
    if (modeOf(resolved.token) === 'ro') return noStore(forbidden('read_only'));
    const pinResp = await pinGateResponse(resolved.token.memo_id, resolved.token.token_hash, resolved.token, pin);
    if (pinResp) return pinResp;

    const result = await createTab({
      memo_id: resolved.token.memo_id,
      title: tabTitle,
      tab_id: tabId,
      position: tabPosition,
    });
    if (result.kind === 'limit') return noStore(conflict('tab_limit_reached'));
    return noStore(ok({ tab: result.tab }));
  } catch (err) {
    console.error('create-tab error:', err);
    return noStore(serverError());
  }
}
