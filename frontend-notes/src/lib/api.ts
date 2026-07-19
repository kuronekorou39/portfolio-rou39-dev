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
  has_readonly_url: boolean;
  tab_count: number;
  created_at: string;
  updated_at: string;
}

export interface IssueResult {
  memo_id: string;
  /** 秘密URL。生トークンを含むのはこのレスポンスの1回だけ(サーバはハッシュのみ保持)。 */
  url: string;
}

export type TokenMode = 'rw' | 'ro';

export interface AccessLogEntry {
  ts: string;
  /** アクセス元IPアドレス(IP保存開始前の旧エントリは空)。 */
  ip: string;
  /** HMAC(日次salt, IP) の先頭16hex。旧エントリ表示のフォールバック用。 */
  ip_hash: string;
  ua: string;
  /** 'ro'=読み取り専用URL経由の閲覧。旧エントリは undefined。 */
  via?: TokenMode;
}

export interface MemoData {
  memo: { title: string; updated_at: string };
  /** このURLの権限。'ro' なら閲覧専用(編集操作は 403 になる)。 */
  mode?: TokenMode;
  tabs: { tab_id: string; title: string; content: string; version: number; position: number }[];
  /** 直近のアクセス履歴(新しい順)。読み取り専用URLでは空。 */
  access_log?: AccessLogEntry[];
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

  /** 再発行。旧URLは即無効。新URLの生トークンはこのレスポンスの1回だけ。 */
  reissueMemo(idToken: string, memoId: string): Promise<IssueResult> {
    return request<IssueResult>(`/admin/memos/${encodeURIComponent(memoId)}/reissue`, {
      method: 'POST',
      headers: authHeaders(idToken),
    });
  },
  revokeMemo(idToken: string, memoId: string): Promise<{ revoked: boolean }> {
    return request<{ revoked: boolean }>(`/admin/memos/${encodeURIComponent(memoId)}/revoke`, {
      method: 'POST',
      headers: authHeaders(idToken),
    });
  },
  deleteMemo(idToken: string, memoId: string): Promise<{ deleted: boolean }> {
    return request<{ deleted: boolean }>(`/admin/memos/${encodeURIComponent(memoId)}`, {
      method: 'DELETE',
      headers: authHeaders(idToken),
    });
  },
  renameMemo(idToken: string, memoId: string, title: string): Promise<{ title: string }> {
    return request<{ title: string }>(`/admin/memos/${encodeURIComponent(memoId)}`, {
      method: 'PATCH',
      headers: authHeaders(idToken),
      body: JSON.stringify({ title }),
    });
  },
  memoAccessLog(idToken: string, memoId: string): Promise<{ entries: AccessLogEntry[] }> {
    return request<{ entries: AccessLogEntry[] }>(
      `/admin/memos/${encodeURIComponent(memoId)}/access-log`,
      { headers: authHeaders(idToken) },
    );
  },
  /** 読み取り専用URLの発行/再発行(旧readonly URLは無効化。編集用URLは無傷)。 */
  issueReadonly(idToken: string, memoId: string): Promise<IssueResult> {
    return request<IssueResult>(`/admin/memos/${encodeURIComponent(memoId)}/readonly`, {
      method: 'POST',
      headers: authHeaders(idToken),
    });
  },
  revokeReadonly(idToken: string, memoId: string): Promise<{ revoked: boolean }> {
    return request<{ revoked: boolean }>(
      `/admin/memos/${encodeURIComponent(memoId)}/readonly/revoke`,
      { method: 'POST', headers: authHeaders(idToken) },
    );
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
