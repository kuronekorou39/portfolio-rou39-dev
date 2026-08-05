const BASE_URL = '/api';

/**
 * PIN の最小桁数(数字のみ・上限は事実上なし)。バックエンド lib/notes/pin.ts の PIN_MIN_LEN と一致必須。
 * 桁数は固定しない方針だが、ブルートフォース耐性のため下限だけ設ける(2026-07-21)。
 */
export const PIN_MIN_LEN = 4;

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
  /** メモ画面アクセスに PIN が必要か。 */
  has_pin: boolean;
  /** 編集用の秘密URL(生トークン保存済みなら再表示。旧メモは null=再発行で表示)。 */
  url: string | null;
  /** 読み取り専用の秘密URL。 */
  readonly_url: string | null;
  /** 編集用URLの有効期限(ISO8601)。null=無期限。 */
  url_expires_at: string | null;
  /** 編集用URLが期限切れか(サーバ時刻基準)。期限切れでもデータは残り、復活で同じURLが生き返る。 */
  url_expired: boolean;
  /** 読み取り専用URLの有効期限(ISO8601)。null=無期限。 */
  readonly_url_expires_at: string | null;
  /** 読み取り専用URLが期限切れか。 */
  readonly_url_expired: boolean;
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
  /** memo_id はメモ単位のローカル状態(最後に見ていたタブ・既読IP)の保存キーに使う。 */
  memo: { memo_id?: string; title: string; updated_at: string };
  /** このURLの権限。'ro' なら閲覧専用(編集操作は 403 になる)。 */
  mode?: TokenMode;
  /** このメモが PIN 保護されているか(書き込み時に PIN を同送する必要がある)。 */
  has_pin?: boolean;
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
  /** PIN を設定/変更(pin は4桁以上の数字。桁数は固定しない)。null で解除。 */
  setPin(idToken: string, memoId: string, pin: string | null): Promise<{ has_pin: boolean }> {
    return request<{ has_pin: boolean }>(`/admin/memos/${encodeURIComponent(memoId)}/pin`, {
      method: 'PUT',
      headers: authHeaders(idToken),
      body: JSON.stringify({ pin }),
    });
  },
  /**
   * 秘密URLの有効期限を設定/延長/クリア(可逆)。expiresAt=ISO文字列で期限設定、null で無期限化(復活)。
   * kind='rw' は編集用、'ro' は閲覧のみURL。revoke と違い同じURLのまま有効/期限切れを往復できる。
   */
  setUrlExpiry(
    idToken: string,
    memoId: string,
    kind: TokenMode,
    expiresAt: string | null,
  ): Promise<{ kind: TokenMode; expires_at: string | null }> {
    return request(`/admin/memos/${encodeURIComponent(memoId)}/expiry`, {
      method: 'PUT',
      headers: authHeaders(idToken),
      body: JSON.stringify({ kind, expires_at: expiresAt }),
    });
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
  // PIN 保護されたメモは pin を同送する(未設定なら pin=undefined でも通る)。
  getMemo(token: string, pin?: string): Promise<MemoData> {
    return request<MemoData>('/m/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, pin }),
      cache: 'no-store',
    });
  },
  saveTab(
    token: string,
    params: { tab_id: string; base_version: number; title: string; content: string },
    pin?: string,
  ): Promise<{ version: number }> {
    return request<{ version: number }>('/m/tabs/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, pin, ...params }),
      cache: 'no-store',
    });
  },
  /**
   * タブ追加。tab_id と position はクライアントが決めて送る(UI を先に更新して裏で作る
   * 楽観追加のため。サーバ採番だと仮ID→実IDの差し替えが必要になり、dirty バッファや
   * debounce タイマーのキーがずれる)。
   */
  createTab(
    token: string,
    params: { tab_id: string; title: string; position: number },
    pin?: string,
  ): Promise<{ tab: MemoData['tabs'][number] }> {
    return request<{ tab: MemoData['tabs'][number] }>('/m/tabs/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, pin, ...params }),
      cache: 'no-store',
    });
  },
  /** タブの並べ替え。渡した順に position が 0,1,2… で振り直される。 */
  reorderTabs(token: string, tab_ids: string[], pin?: string): Promise<{ reordered: boolean }> {
    return request<{ reordered: boolean }>('/m/tabs/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, tab_ids, pin }),
      cache: 'no-store',
    });
  },
  deleteTab(token: string, tab_id: string, pin?: string): Promise<{ deleted: boolean }> {
    return request<{ deleted: boolean }>('/m/tabs/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, tab_id, pin }),
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
    opts: { keepalive?: boolean; pin?: string } = {},
  ): Promise<{ results: { tab_id: string; result: string; version?: number }[] }> {
    return request('/m/flush', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, tabs, pin: opts.pin }),
      cache: 'no-store',
      keepalive: opts.keepalive ?? false,
    });
  },
};
