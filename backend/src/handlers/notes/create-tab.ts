import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ok, badRequest, notFound, conflict, forbidden, tooManyRequests, serverError } from '../../lib/response';
import { noStore } from '../../lib/notes/http';
import { resolveTokenThrottled, modeOf } from '../../lib/notes/tokens';
import { createTab } from '../../lib/notes/tabs';
import { MIN_SAVE_INTERVAL_MS } from '../../lib/notes/limits';

/** POST /m/tabs/create — タブ追加(上限は memos.tab_count の条件付きカウンタで強制)。 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return noStore(notFound());
    }
    const { token, title } = body as { token?: unknown; title?: unknown };
    if (typeof token !== 'string' || !token) return noStore(notFound());
    const tabTitle = typeof title === 'string' ? title : '';
    if (tabTitle.length > 200) return noStore(badRequest('title_too_long'));

    // 作成も書き込みなので保存と同じスロットル窓を消費する
    const resolved = await resolveTokenThrottled(token, 'last_save_ms', MIN_SAVE_INTERVAL_MS);
    if (resolved.kind === 'invalid') return noStore(notFound());
    if (resolved.kind === 'throttled') return noStore(tooManyRequests('save_throttled'));
    if (modeOf(resolved.token) === 'ro') return noStore(forbidden('read_only'));

    const result = await createTab({ memo_id: resolved.token.memo_id, title: tabTitle });
    if (result.kind === 'limit') return noStore(conflict('tab_limit_reached'));
    return noStore(ok({ tab: result.tab }));
  } catch (err) {
    console.error('create-tab error:', err);
    return noStore(serverError());
  }
}
