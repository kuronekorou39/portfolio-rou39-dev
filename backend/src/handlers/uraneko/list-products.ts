import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../lib/dynamo';
import { ok, serverError } from '../../lib/response';
import { hasAvailableToken } from '../../lib/uraneko/token-claim';
import { presignThumbnail } from '../../lib/uraneko/thumbnail';
import type { VideoProduct } from '../../lib/uraneko/types';

const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE!;

// API レスポンスには bits / source_s3_key / 生の s3_key を絶対含めない。
// サムネは presigned URL(thumbnail_url)にして内部キーは出さない。
function toPublicProduct(p: VideoProduct) {
  return {
    product_id: p.product_id,
    title: p.title,
    description: p.description,
    price_jpy: p.price_jpy,
    duration_sec: p.duration_sec,
  };
}

export async function handler(_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const res = await docClient.send(
      new ScanCommand({
        TableName: PRODUCTS_TABLE,
        FilterExpression: 'published = :t',
        ExpressionAttributeValues: { ':t': true },
      }),
    );
    const products = (res.Items as VideoProduct[] | undefined) ?? [];
    const items = await Promise.all(
      products.map(async (p) => ({
        ...toPublicProduct(p),
        available: await hasAvailableToken(p.product_id),
        thumbnail_url: await presignThumbnail(p.thumbnail_s3_key),
      })),
    );
    return ok(items);
  } catch (err) {
    console.error('list-products error:', err);
    return serverError();
  }
}
