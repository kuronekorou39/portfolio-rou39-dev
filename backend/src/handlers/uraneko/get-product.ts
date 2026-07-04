import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../lib/dynamo';
import { ok, notFound, badRequest, serverError } from '../../lib/response';
import { hasAvailableToken } from '../../lib/uraneko/token-claim';
import { presignThumbnail } from '../../lib/uraneko/thumbnail';
import type { VideoProduct } from '../../lib/uraneko/types';

const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE!;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const productId = event.pathParameters?.product_id;
    if (!productId) return badRequest('product_id required');

    const res = await docClient.send(
      new GetCommand({ TableName: PRODUCTS_TABLE, Key: { product_id: productId } }),
    );
    const item = res.Item as VideoProduct | undefined;
    if (!item || !item.published) return notFound();

    const sampleKeys = Array.isArray(item.sample_s3_keys) ? item.sample_s3_keys : [];
    const sample_urls = (await Promise.all(sampleKeys.map((k) => presignThumbnail(k)))).filter(
      (u): u is string => !!u,
    );

    return ok({
      product_id: item.product_id,
      title: item.title,
      description: item.description,
      price_jpy: item.price_jpy,
      duration_sec: item.duration_sec,
      thumbnail_url: await presignThumbnail(item.thumbnail_s3_key),
      sample_urls,
      available: await hasAvailableToken(item.product_id),
    });
  } catch (err) {
    console.error('get-product error:', err);
    return serverError();
  }
}
