import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ok, badRequest, notFound, forbidden, tooManyRequests, serverError } from '../../lib/response';
import { noStore } from '../../lib/notes/http';
import { resolveTokenThrottled, modeOf } from '../../lib/notes/tokens';
import { saveTab } from '../../lib/notes/tabs';
import { MAX_TABS_PER_MEMO, MIN_FLUSH_INTERVAL_MS } from '../../lib/notes/limits';

interface FlushTab {
  tab_id: string;
  base_version: number;
  title: string;
  content: string;
}

/**
 * POST /m/flush — 未保存タブの一括保存(ページ離脱時のフラッシュ用)。
 *
 * 複数の dirty タブを「1回のスロットル消費」で保存する。タブ毎に個別 POST すると
 * 2枚目以降が per-token スロットルに当たって離脱時に編集が消えるため、必ずこの
 * バッチ経路を使う。スロットル窓も保存(last_save_ms)とは独立の last_flush_ms
 * (直前に通常保存していても離脱フラッシュが 429 にならない)。
 * 結果はタブ毎に返す(部分成功あり)。conflict のサーバ値は返さない
 * (離脱中で調停 UI を出せないため。次回ロード時に localStorage バッファと調停する)。
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return noStore(notFound());
    }
    const { token, tabs } = body as { token?: unknown; tabs?: unknown };
    if (typeof token !== 'string' || !token) return noStore(notFound());
    if (!Array.isArray(tabs) || tabs.length === 0 || tabs.length > MAX_TABS_PER_MEMO) {
      return noStore(badRequest('invalid_params'));
    }
    for (const t of tabs as FlushTab[]) {
      if (
        typeof t?.tab_id !== 'string' ||
        !Number.isInteger(t?.base_version) ||
        typeof t?.title !== 'string' ||
        typeof t?.content !== 'string'
      ) {
        return noStore(badRequest('invalid_params'));
      }
    }

    const resolved = await resolveTokenThrottled(token, 'last_flush_ms', MIN_FLUSH_INTERVAL_MS);
    if (resolved.kind === 'invalid') return noStore(notFound());
    if (resolved.kind === 'throttled') return noStore(tooManyRequests('flush_throttled'));
    if (modeOf(resolved.token) === 'ro') return noStore(forbidden('read_only'));

    const memo_id = resolved.token.memo_id;
    const results = [];
    for (const t of tabs as FlushTab[]) {
      const r = await saveTab({
        memo_id,
        tab_id: t.tab_id,
        base_version: t.base_version,
        title: t.title.slice(0, 200),
        content: t.content,
      });
      results.push({
        tab_id: t.tab_id,
        result: r.kind,
        version: r.kind === 'ok' ? r.version : undefined,
      });
    }
    return noStore(ok({ results }));
  } catch (err) {
    console.error('flush error:', err);
    return noStore(serverError());
  }
}
