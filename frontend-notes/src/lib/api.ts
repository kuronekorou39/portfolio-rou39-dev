const BASE_URL = '/api';

/** ステータスコードで分岐できる API エラー(404=失効/未知、409=競合/上限、413/429)。 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  /** 409 の { current } など、エラー本文の追加ペイロード。 */
  readonly body: Record<string, unknown>;

  constructor(status: number, code: string | null, body: Record<string, unknown> = {}) {
    super(code ?? `Request failed ${status}`);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, typeof body.error === 'string' ? body.error : null, body);
  }
  return res.json();
}

function authHeaders(token: string): HeadersInit {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export interface MemoSummary {
  memo_id: string;
  title: string;
  has_active_url: boolean;
  tab_count: number;
  created_at: string;
  updated_at: string;
}

export interface IssueResult {
  memo_id: string;
  /** 秘密URL。生トークンを含むのはこのレスポンスの1回だけ(サーバはハッシュのみ保持)。 */
  url: string;
}

export interface MemoData {
  memo: { title: string; updated_at: string };
  tabs: { tab_id: string; title: string; content: string; version: number; position: number }[];
}

export const api = {
  // ---- 管理(Cognito IDトークン必須) ----
  listMemos(idToken: string): Promise<MemoSummary[]> {
    return request<MemoSummary[]>('/admin/memos', { headers: authHeaders(idToken) });
  },
  issueMemo(idToken: string, title: string): Promise<IssueResult> {
    return request<IssueResult>('/admin/memos', {
      method: 'POST',
      headers: authHeaders(idToken),
      body: JSON.stringify({ title }),
    });
  },

  // ---- メモ画面(秘密URLトークンを body でのみ渡す。path/query に載せない) ----
  getMemo(token: string): Promise<MemoData> {
    return request<MemoData>('/m/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    });
  },
  saveTab(
    token: string,
    params: { tab_id: string; base_version: number; title: string; content: string },
  ): Promise<{ version: number }> {
    return request<{ version: number }>('/m/tabs/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...params }),
      cache: 'no-store',
    });
  },
  createTab(token: string, title: string): Promise<{ tab: MemoData['tabs'][number] }> {
    return request<{ tab: MemoData['tabs'][number] }>('/m/tabs/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, title }),
      cache: 'no-store',
    });
  },
  deleteTab(token: string, tab_id: string): Promise<{ deleted: boolean }> {
    return request<{ deleted: boolean }>('/m/tabs/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, tab_id }),
      cache: 'no-store',
    });
  },
  /**
   * 未保存タブの一括保存。ページ離脱時は keepalive: true で送る
   * (通常 fetch はページ破棄で中断される。sendBeacon でなく fetch keepalive を
   * 使うのは、60KB 級タブ + 封筒で sendBeacon の 64KB 制限に当たり得るため)。
   */
  flush(
    token: string,
    tabs: { tab_id: string; base_version: number; title: string; content: string }[],
    opts: { keepalive?: boolean } = {},
  ): Promise<{ results: { tab_id: string; result: string; version?: number }[] }> {
    return request('/m/flush', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, tabs }),
      cache: 'no-store',
      keepalive: opts.keepalive ?? false,
    });
  },
};
