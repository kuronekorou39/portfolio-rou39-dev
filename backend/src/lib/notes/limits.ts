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
