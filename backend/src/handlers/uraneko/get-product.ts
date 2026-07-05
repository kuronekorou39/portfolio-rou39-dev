import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../lib/dynamo';
import { ok, notFound, badRequest, serverError } from '../../lib/response';
import { hasAvailableToken } from '../../lib/uraneko/token-claim';
import { galleryImage, type GalleryImage } from '../../lib/uraneko/thumbnail';
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

    // ギャラリー = サムネ + サンプル画像(各々 blur/reveal を適用)。
    const thumbEntry = await galleryImage(
      item.thumbnail_s3_key,
      item.thumbnail_blur,
      item.thumbnail_reveal ?? true,
    );
    const samples = Array.isArray(item.samples) ? item.samples : [];
    const sampleEntries = await Promise.all(samples.map((s) => galleryImage(s.key, s.blur, s.reveal)));
    const gallery = [thumbEntry, ...sampleEntries].filter((e): e is GalleryImage => !!e);

    return ok({
      product_id: item.product_id,
      title: item.title,
      description: item.description,
      price_jpy: item.price_jpy,
      duration_sec: item.duration_sec,
      thumbnail_url: thumbEntry?.url ?? null,
      gallery,
      available: await hasAvailableToken(item.product_id),
    });
  } catch (err) {
    console.error('get-product error:', err);
    return serverError();
  }
}
