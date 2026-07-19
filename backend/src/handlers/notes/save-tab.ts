import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  ok,
  badRequest,
  notFound,
  conflict,
  forbidden,
  payloadTooLarge,
  tooManyRequests,
  serverError,
} from '../../lib/response';
import { noStore } from '../../lib/notes/http';
import { resolveTokenThrottled, modeOf } from '../../lib/notes/tokens';
import { saveTab } from '../../lib/notes/tabs';
import { MIN_SAVE_INTERVAL_MS } from '../../lib/notes/limits';

/**
 * POST /m/tabs/save — タブ本文の保存(オーソライザー無し、トークンは body)。
 * per-token スロットル(429)→ 60KB 上限(413)→ version 楽観ロック(409)。
 * 409 にはサーバの現在値を含め、クライアントが黙って上書きせず調停できるようにする。
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return noStore(notFound());
    }
    const { token, tab_id, base_version, title, content } = body as {
      token?: unknown;
      tab_id?: unknown;
      base_version?: unknown;
      title?: unknown;
      content?: unknown;
    };
    if (typeof token !== 'string' || !token) return noStore(notFound());
    if (
      typeof tab_id !== 'string' ||
      !Number.isInteger(base_version) ||
      typeof title !== 'string' ||
      typeof content !== 'string'
    ) {
      return noStore(badRequest('invalid_params'));
    }
    if (title.length > 200) return noStore(badRequest('title_too_long'));

    const resolved = await resolveTokenThrottled(token, 'last_save_ms', MIN_SAVE_INTERVAL_MS);
    if (resolved.kind === 'invalid') return noStore(notFound());
    if (resolved.kind === 'throttled') return noStore(tooManyRequests('save_throttled'));
    // 読み取り専用URLは書き込み不可。トークンは有効なので 404 ではなく 403(オラクルにはならない)
    if (modeOf(resolved.token) === 'ro') return noStore(forbidden('read_only'));

    const result = await saveTab({
      memo_id: resolved.token.memo_id,
      tab_id,
      base_version: base_version as number,
      title,
      content,
    });
    switch (result.kind) {
      case 'ok':
        return noStore(ok({ version: result.version }));
      case 'too_large':
        return noStore(payloadTooLarge('content_too_large'));
      case 'not_found':
        return noStore(notFound());
      case 'conflict':
        return noStore(conflict('version_mismatch', { current: result.current }));
    }
  } catch (err) {
    console.error('save-tab error:', err); // token/body はログに出さない
    return noStore(serverError());
  }
}
