import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../lib/dynamo';
import { ok, forbidden, serverError } from '../../lib/response';
import type { Memo } from '../../lib/notes/types';

const MEMOS_TABLE = process.env.MEMOS_TABLE!;

/** GET /admin/memos — 自分のメモ一覧(新しい順、Cognito オーソライザー必須)。 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userSub = event.requestContext.authorizer?.claims?.sub as string | undefined;
    if (!userSub) return forbidden('login_required');

    const res = await docClient.send(
      new QueryCommand({
        TableName: MEMOS_TABLE,
        IndexName: 'by_owner',
        KeyConditionExpression: 'owner_user_id = :u',
        ExpressionAttributeValues: { ':u': userSub },
        ScanIndexForward: false, // 新しい順
        Limit: 100,
      }),
    );

    const items = ((res.Items as Memo[] | undefined) ?? [])
      .filter((m) => m.status !== 'deleted')
      .map((m) => ({
        memo_id: m.memo_id,
        title: m.title,
        // 生トークンは無いので URL は返せない(発行/再発行時のみ)。有効状態だけ返す
        has_active_url: !!m.active_token_hash,
        tab_count: m.tab_count,
        created_at: m.created_at,
        updated_at: m.updated_at,
      }));

    return ok(items);
  } catch (err) {
    console.error('list-memos error:', err);
    return serverError();
  }
}
