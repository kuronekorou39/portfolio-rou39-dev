// 無料枠の上限。運用で調整する値なのでここに集約する。

/** 1ユーザーが持てるメモ(=秘密URL)数の上限。発行時に原子的カウンタで強制。 */
export const MAX_MEMOS_PER_USER = 20;

/** 1メモのタブ数上限。作成時に原子的カウンタで強制。 */
export const MAX_TABS_PER_MEMO = 12;

/**
 * 1タブの本文上限(UTF-8 バイト)。
 * DynamoDB の 400KB item 制限、退出時フラッシュ(fetch keepalive / sendBeacon)の
 * 64KB 制限、全タブ取得 Query の 1MB/ページ制限(MAX_TABS_PER_MEMO × 本値 ≤ 約1MB)
 * のすべてに封筒分の余裕を持たせた値。
 */
export const TAB_CAP_BYTES = 60_000;

/**
 * 秘密URLトークンごとの保存間隔の下限(ms)。トークンアイテム上の条件付き更新で
 * 強制するアプリ層スロットル(WAF は IP 単位でしか制御できず、origin 直叩きで
 * バイパスも可能なので、これが実質の防御)。最大でも 60回/分/トークン に抑える。
 * クライアントの debounce(約1.3秒)より短くしておくこと(正常操作を 429 にしない)。
 */
export const MIN_SAVE_INTERVAL_MS = 1_000;

/**
 * 退出時フラッシュ(/m/flush)の間隔下限(ms)。保存(last_save_ms)とは独立の
 * last_flush_ms で管理する。直前に通常保存していても退出フラッシュが 429 に
 * ならないように分離している(ページ離脱時の 429 はリトライ不能=編集消失のため)。
 */
export const MIN_FLUSH_INTERVAL_MS = 1_000;

/**
 * アクセスログの coalesce 窓(ms)。同じ秘密URLからの閲覧はこの間隔で1件だけ記録する。
 * 未スロットルの読み取りパスからの書き込みアンプ(連打で無制限にログ行が増える)を防ぎ、
 * 「誰がいつ開いたか」という目的には十分な粒度に抑える。
 */
export const ACCESS_LOG_COALESCE_MS = 10 * 60 * 1000;

/** アクセスログの保持日数(DynamoDB TTL)。 */
export const ACCESS_LOG_RETENTION_DAYS = 90;
