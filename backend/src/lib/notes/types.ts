/** トークンの権限モード。'rw'=読み書き(既定)、'ro'=読み取り専用。 */
export type TokenMode = 'rw' | 'ro';

/** notes-memos のメモ本体(メタ)。タブ本文は notes-tabs に分離。 */
export interface Memo {
  memo_id: string;
  owner_user_id: string; // Cognito sub
  title: string;
  /** 現在有効な「編集用」秘密URLトークンの SHA-256(フル64hex)。失効中は null。解決の照合鍵。 */
  active_token_hash: string | null;
  /**
   * 管理画面での URL 再表示用に、生トークンも保存する(2026-07-20)。
   * これにより DB ダンプで秘密URLが露出するが、本サービスはメモ本文も平文保存(E2Eなし)
   * のため脅威モデルは実質変わらない。表示はログイン必須の管理画面のみ。
   * この属性が無い旧メモは「再発行で表示」フォールバック。
   */
  active_token_raw?: string | null;
  /**
   * 現在有効な「読み取り専用」秘密URLトークンの SHA-256。編集用とは独立に発行/失効できる。
   * 一度も発行していないメモでは属性自体が存在しない(undefined)、失効後は null。
   */
  active_readonly_token_hash?: string | null;
  /** 読み取り専用URLの生トークン(管理画面での再表示用)。 */
  active_readonly_token_raw?: string | null;
  /** メモ画面アクセス時に要求する PIN(scrypt ハッシュ "salt:hash")。未設定なら属性なし。 */
  pin_hash?: string | null;
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
  /** 権限。属性が無い旧トークンは 'rw' 扱い(後方互換)。書き込み系は 'ro' を 403 で弾く。 */
  mode?: TokenMode;
  issued_at: string;
  revoked_at?: string | null;
  /** per-token 保存スロットル(P3)。最終保存時刻 epoch ms。 */
  last_save_ms?: number;
  /**
   * 秘密URLの有効期限 epoch ms(2026-07-21)。これを過ぎると resolveToken が解決を拒否し
   * メモを開けなくなる。ただし token レコード・メモ本文は消さないので、管理画面から期限の
   * 延長/削除(無期限化)で同じURLのまま復活できる(可逆)。属性なし=無期限。
   * ※ tokens テーブルには DynamoDB TTL を設定しないこと(復活可能なトークンが物理削除される)。
   */
  url_expires_at?: number;
  /** PIN 連続失敗回数(上限でロック)。トークン単位なので漏洩URLの総当たりが他に波及しない。 */
  pin_fail_count?: number;
  /** PIN ロック期限 epoch ms。これ未満の間は PIN 照合を受け付けない。 */
  pin_locked_until?: number;
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
  /** どのURL経由の閲覧か(編集用/読み取り専用)。旧エントリは未設定。 */
  via?: TokenMode;
  ts: string;
  expires_at: number; // epoch秒(TTL)
}

/** notes-users の無料枠カウンタ行(PK user_id)。未認証 Lambda からは一切触らない。 */
export interface NotesUserQuota {
  user_id: string;
  memo_count: number;
}
