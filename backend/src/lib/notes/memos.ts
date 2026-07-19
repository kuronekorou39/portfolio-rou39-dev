import { BatchWriteCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../dynamo';
import { getOwnedMemo, revokeToken } from './tokens';
import type { Tab } from './types';

const USERS_TABLE = process.env.USERS_TABLE!;
const MEMOS_TABLE = process.env.MEMOS_TABLE!;
const TABS_TABLE = process.env.TABS_TABLE!;

/** メモの管理用タイトル変更。所有者+active の条件付き。 */
export async function renameMemo(params: {
  memo_id: string;
  owner_user_id: string;
  title: string;
}): Promise<{ ok: boolean }> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: MEMOS_TABLE,
        Key: { memo_id: params.memo_id },
        ConditionExpression: 'owner_user_id = :me AND #s = :active',
        UpdateExpression: 'SET title = :title, updated_at = :now',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':me': params.owner_user_id,
          ':active': 'active',
          ':title': params.title,
          ':now': new Date().toISOString(),
        },
      }),
    );
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'ConditionalCheckFailedException') {
      return { ok: false };
    }
    throw err;
  }
  return { ok: true };
}

/**
 * メモの削除(カスケード)。順序が重要:
 *   1. まずトークンを失効(生きている秘密URLが半削除状態のメモを配信しないように)
 *   2. タブを一括削除(本文データの解放)
 *   3. メモ本体を soft-delete(status='deleted'。一覧から消え、get-memo も 404)
 *   4. 無料枠カウンタを返却(best-effort)
 * 各段は冪等なので、途中失敗してもリトライで収束する。
 */
export async function deleteMemo(params: {
  memo_id: string;
  owner_user_id: string;
}): Promise<{ ok: boolean }> {
  const memo = await getOwnedMemo(params.memo_id, params.owner_user_id);
  if (!memo) return { ok: false };

  // 1. トークン失効(編集用・読み取り専用の両方。生きたURLが半削除メモを配信しないように)
  await revokeToken({ ...params, mode: 'rw' });
  await revokeToken({ ...params, mode: 'ro' });

  // 2. タブ一括削除(BatchWrite は25件/回)
  const tabsRes = await docClient.send(
    new QueryCommand({
      TableName: TABS_TABLE,
      KeyConditionExpression: 'memo_id = :m',
      ExpressionAttributeValues: { ':m': params.memo_id },
      ProjectionExpression: 'memo_id, tab_id',
    }),
  );
  const tabs = (tabsRes.Items as Pick<Tab, 'memo_id' | 'tab_id'>[] | undefined) ?? [];
  for (let i = 0; i < tabs.length; i += 25) {
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABS_TABLE]: tabs.slice(i, i + 25).map((t) => ({
            DeleteRequest: { Key: { memo_id: t.memo_id, tab_id: t.tab_id } },
          })),
        },
      }),
    );
  }

  // 3. soft-delete(行は残す=将来のアクセスログ突合や誤操作調査のため)
  await docClient.send(
    new UpdateCommand({
      TableName: MEMOS_TABLE,
      Key: { memo_id: params.memo_id },
      ConditionExpression: 'owner_user_id = :me',
      UpdateExpression: 'SET #s = :deleted, updated_at = :now',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':me': params.owner_user_id,
        ':deleted': 'deleted',
        ':now': new Date().toISOString(),
      },
    }),
  );

  // 4. カウンタ返却(coupon.ts releaseRedemption と同じ best-effort)
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { user_id: params.owner_user_id },
        ConditionExpression: 'memo_count > :zero',
        UpdateExpression: 'ADD memo_count :minus',
        ExpressionAttributeValues: { ':zero': 0, ':minus': -1 },
      }),
    );
  } catch {
    // best-effort
  }

  return { ok: true };
}
