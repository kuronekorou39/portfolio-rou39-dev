const BASE_URL = '/api';

/** ステータスコードで分岐できる API エラー(404=失効/未知トークン、409=上限 等)。 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null) {
    super(code ?? `Request failed ${status}`);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, typeof body.error === 'string' ? body.error : null);
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
};
