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
