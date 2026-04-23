import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../lib/dynamo';
import { ok, serverError } from '../../lib/response';
import type { VideoProduct } from '../../lib/uraneko/types';

const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE!;

// API レスポンスには bits / source_s3_key を絶対含めない。
// 商品マスタ側には bits は無いが、念のためクライアント向けに返す属性を限定する。
function toPublicProduct(p: VideoProduct) {
  return {
    product_id: p.product_id,
    title: p.title,
    description: p.description,
    price_jpy: p.price_jpy,
    duration_sec: p.duration_sec,
    thumbnail_s3_key: p.thumbnail_s3_key,
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
    const items = ((res.Items as VideoProduct[] | undefined) ?? []).map(toPublicProduct);
    return ok(items);
  } catch (err) {
    console.error('list-products error:', err);
    return serverError();
  }
}
