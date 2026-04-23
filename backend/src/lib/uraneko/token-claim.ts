import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../dynamo';
import type { VideoToken } from './types';

const TOKENS_TABLE = process.env.TOKENS_TABLE!;

/**
 * 指定 product の未割当トークンを古い順に 1 件探して、condition expression で
 * status=unassigned を保ったまま assigned に更新する。
 *
 * 並列購入時も最終的に 1 ユーザー = 1 トークン が保証される(条件不成立 → 次の候補へ)。
 */
export async function claimToken(params: {
  product_id: string;
  user_id: string;
  order_id: string;
}): Promise<VideoToken | null> {
  const { product_id, user_id, order_id } = params;
  const now = new Date().toISOString();

  // GSI で未割当の古い順に最大 10 件取得(競合時のリトライ余地)
  const q = await docClient.send(
    new QueryCommand({
      TableName: TOKENS_TABLE,
      IndexName: 'by_product_status',
      KeyConditionExpression: 'product_id = :pid AND begins_with(status_created_at, :prefix)',
      ExpressionAttributeValues: {
        ':pid': product_id,
        ':prefix': 'unassigned#',
      },
      Limit: 10,
    }),
  );

  const candidates = (q.Items as VideoToken[] | undefined) ?? [];
  if (candidates.length === 0) return null;

  for (const candidate of candidates) {
    try {
      const newStatusCreatedAt = `assigned#${candidate.created_at}`;
      const updated = await docClient.send(
        new UpdateCommand({
          TableName: TOKENS_TABLE,
          Key: { token_id: candidate.token_id },
          ConditionExpression: '#s = :unassigned',
          UpdateExpression:
            'SET #s = :assigned, status_created_at = :newSca, assigned_to = :u, assigned_at = :t, order_id = :o',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: {
            ':unassigned': 'unassigned',
            ':assigned': 'assigned',
            ':newSca': newStatusCreatedAt,
            ':u': user_id,
            ':t': now,
            ':o': order_id,
          },
          ReturnValues: 'ALL_NEW',
        }),
      );
      return updated.Attributes as VideoToken;
    } catch (err: unknown) {
      // ConditionalCheckFailedException は競合なので次の候補へ
      const name = (err as { name?: string })?.name;
      if (name === 'ConditionalCheckFailedException') continue;
      throw err;
    }
  }

  return null;
}
