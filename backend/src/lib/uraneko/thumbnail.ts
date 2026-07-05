import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const ASSETS_BUCKET = process.env.ASSETS_BUCKET!;
// サムネは API 応答直後に表示されるため実質短時間で足りるが、
// 一覧のブラウザキャッシュを効かせる意味で 1 時間。バケットは private のまま。
const THUMB_URL_TTL_SEC = 3600;

const s3 = new S3Client({});

/**
 * サムネ / サンプル画像の presigned GET URL を返す。キーが空/未設定なら null。
 * 動画本体と違い購入前の一覧・詳細で公開表示するが、バケットは private のまま
 * 署名URLで都度配る(公開バケット化で動画を晒すリスクを避ける)。
 * 多層防御: 公開APIが署名するのは thumbnails/ と samples/ 配下だけに限定する
 * (万一 videos/ の key が紛れても、動画本体の署名URLは出さない)。
 */
export async function presignThumbnail(key: string | undefined | null): Promise<string | null> {
  if (!key) return null;
  if (!(key.startsWith('thumbnails/') || key.startsWith('samples/'))) return null;
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: ASSETS_BUCKET, Key: key }), {
    expiresIn: THUMB_URL_TTL_SEC,
  });
}

// 原画像 key → ぼかし版 key(store の blurKeyFor と一致させること)
export function blurKey(origKey: string): string {
  const dot = origKey.lastIndexOf('.');
  const base = dot >= 0 ? origKey.slice(0, dot) : origKey;
  return `${base}.blur.jpg`;
}

export interface GalleryImage {
  url: string; // 表示用(ぼかし指定ならぼかし版)
  zoom_url: string | null; // 拡大時に見せる原画。ぼかし&外さない画像は null(原画を配信しない)
}

/**
 * 1画像の表示URLと拡大URLを返す。**外れない(blur!=none かつ reveal=false)なら
 * 原画像の署名URLは一切生成せず zoom_url=null**(原画をブラウザに送らない)。
 */
export async function galleryImage(
  origKey: string | undefined | null,
  blur: string | undefined,
  reveal: boolean | undefined,
): Promise<GalleryImage | null> {
  if (!origKey) return null;
  const blurred = !!blur && blur !== 'none';
  const url = await presignThumbnail(blurred ? blurKey(origKey) : origKey);
  if (!url) return null;
  const zoom_url = !blurred || reveal ? await presignThumbnail(origKey) : null;
  return { url, zoom_url };
}
