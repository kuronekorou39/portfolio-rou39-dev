/** notes-memos のメモ本体(メタ)。タブ本文は notes-tabs に分離。 */
export interface Memo {
  memo_id: string;
  owner_user_id: string; // Cognito sub
  title: string;
  /** 現在有効な秘密URLトークンの SHA-256(フル64hex)。失効中は null。 */
  active_token_hash: string | null;
  tab_count: number;
  status: 'active' | 'deleted';
  created_at: string;
  updated_at: string;
}

/** notes-tabs のタブ(PK memo_id / SK tab_id)。本文は inline(TAB_CAP_BYTES 以下)。 */
export interface Tab {
  memo_id: string;
  tab_id: string;
  title: string;
  content: string;
  /** タブ単位の楽観ロック用の単調増加バージョン。保存は version 一致が条件。 */
  version: number;
  position: number;
  byte_size: number;
  created_at: string;
  updated_at: string;
}

/**
 * notes-tokens の秘密URLトークン(PK token_hash = SHA-256 フル64hex)。
 * 生トークンは保存しない(発行レスポンスで1度だけ返す)。
 * 解決は必ず PK への ConsistentRead GetItem(強整合)で行う。
 */
export interface NotesToken {
  token_hash: string;
  memo_id: string;
  owner_user_id: string;
  status: 'active' | 'revoked';
  issued_at: string;
  revoked_at?: string | null;
  /** per-token 保存スロットル(P3)。最終保存時刻 epoch ms。 */
  last_save_ms?: number;
}

/**
 * notes-access-logs のアクセス記録(PK memo_id / SK ts_ulid)。
 * 生IPを保存・表示する(2026-07-19 ユーザー決定。「誰が開いたか」を実用にするため)。
 * ip_hash(HMAC(日次salt, ip) 先頭16hex)も併存させ、日をまたいだ同一性の目安に使える。
 * expires_at の TTL(90日)で自動失効する。
 */
export interface AccessLogEntry {
  memo_id: string;
  ts_ulid: string; // `${ISO時刻}#${乱数}` — 新しい順に Query するための複合SK
  token_hash: string; // どのURL経由か(生トークンは絶対に保存しない)
  ip: string;
  ip_hash: string;
  ua: string;
  event: 'view';
  ts: string;
  expires_at: number; // epoch秒(TTL)
}

/** notes-users の無料枠カウンタ行(PK user_id)。未認証 Lambda からは一切触らない。 */
export interface NotesUserQuota {
  user_id: string;
  memo_count: number;
}
