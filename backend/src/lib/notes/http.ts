/**
 * メモ系 API のレスポンスに Cache-Control: no-store を付ける。
 * 秘密URLトークンで認可されたレスポンスを CloudFront・ブラウザのどこにも
 * キャッシュさせないため、メモ系ハンドラの全レスポンスに必ず適用する
 * (/api/* の CloudFront ビヘイビアは ResponseHeadersPolicy を持たないので
 * Lambda 側で付与するしかない)。
 */
export function noStore<T extends { headers?: Record<string, string> }>(res: T): T {
  return { ...res, headers: { ...res.headers, 'Cache-Control': 'no-store' } };
}
