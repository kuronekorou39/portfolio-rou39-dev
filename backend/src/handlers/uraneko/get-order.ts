import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { docClient } from '../../lib/dynamo';
import { ok, badRequest, notFound, forbidden, serverError } from '../../lib/response';
import { verifyOrderToken } from '../../lib/uraneko/order-token';
import { verifyMember, authHeaderOf } from '../../lib/uraneko/member-auth';
import type { Order, VideoToken } from '../../lib/uraneko/types';

const ORDERS_TABLE = process.env.ORDERS_TABLE!;
const TOKENS_TABLE = process.env.TOKENS_TABLE!;
const ASSETS_BUCKET = process.env.ASSETS_BUCKET!;
const SIGNED_URL_TTL_SEC = 900; // 15 分

const s3 = new S3Client({});

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const order_id = event.pathParameters?.order_id;
    if (!order_id) return badRequest('order_id required');

    const orderRes = await docClient.send(
      new GetCommand({ TableName: ORDERS_TABLE, Key: { order_id } }),
    );
    const order = orderRes.Item as Order | undefined;
    if (!order) return notFound();

    // 認可: Cognito の sub が一致(会員)OR 署名トークンが一致(ゲスト/メールリンク)。
    // /orders/{id} はオーソライザー無しなので Authorization ヘッダーを Lambda 側で検証。
    const member = await verifyMember(authHeaderOf(event));
    const qToken = event.queryStringParameters?.token;

    let authorized = false;
    if (member && member.sub === order.user_id) authorized = true;
    if (!authorized && qToken) {
      const verified = await verifyOrderToken(qToken);
      if (verified === order_id) authorized = true;
    }
    if (!authorized) return forbidden('not_authorized');

    // 未払の場合は署名URLは返さない
    if (order.status !== 'paid' || !order.token_id) {
      return ok({
        order_id: order.order_id,
        status: order.status,
        product_id: order.product_id,
        price_jpy: order.price_jpy,
        currency: order.currency,
        created_at: order.created_at,
        paid_at: order.paid_at,
        download_url: null,
      });
    }

    // トークンから s3_key を取得(bits は絶対返さない)
    const tokenRes = await docClient.send(
      new GetCommand({ TableName: TOKENS_TABLE, Key: { token_id: order.token_id } }),
    );
    const token = tokenRes.Item as VideoToken | undefined;
    if (!token) {
      console.error('Token not found for paid order', order_id, order.token_id);
      return serverError();
    }

    // Content-Disposition: attachment を署名に含める。別オリジン(S3)への presigned URL では
    // <a download> 属性が無視されインライン再生されてしまうため、S3 応答側で強制ダウンロードさせる。
    const downloadUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: ASSETS_BUCKET,
        Key: token.s3_key,
        ResponseContentDisposition: `attachment; filename="${order.product_id}.mp4"`,
      }),
      { expiresIn: SIGNED_URL_TTL_SEC },
    );

    return ok({
      order_id: order.order_id,
      status: order.status,
      product_id: order.product_id,
      price_jpy: order.price_jpy,
      currency: order.currency,
      created_at: order.created_at,
      paid_at: order.paid_at,
      download_url: downloadUrl,
      download_url_expires_in: SIGNED_URL_TTL_SEC,
    });
  } catch (err) {
    console.error('get-order error:', err);
    return serverError();
  }
}
