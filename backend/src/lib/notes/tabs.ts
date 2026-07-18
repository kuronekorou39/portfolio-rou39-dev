import { randomUUID } from 'crypto';
import { GetCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../dynamo';
import { MAX_TABS_PER_MEMO, TAB_CAP_BYTES } from './limits';
import type { Tab } from './types';

const MEMOS_TABLE = process.env.MEMOS_TABLE!;
const TABS_TABLE = process.env.TABS_TABLE!;

export type SaveTabResult =
  | { kind: 'ok'; version: number }
  | { kind: 'too_large' }
  | { kind: 'not_found' }
  /** version 不一致(別タブ/別端末が先に保存)。サーバの現在値を返して再調停させる。 */
  | { kind: 'conflict'; current: { title: string; content: string; version: number } };

/**
 * タブ本文の保存。version 一致を条件にした楽観ロックで、古い内容による
 * サイレント上書きを構造的に防ぐ(不一致は 409 でクライアントが調停)。
 */
export async function saveTab(params: {
  memo_id: string;
  tab_id: string;
  base_version: number;
  title: string;
  content: string;
}): Promise<SaveTabResult> {
  const { memo_id, tab_id, base_version, title, content } = params;
  const byte_size = Buffer.byteLength(content, 'utf8');
  if (byte_size > TAB_CAP_BYTES) return { kind: 'too_large' };
  const now = new Date().toISOString();

  try {
    const updated = await docClient.send(
      new UpdateCommand({
        TableName: TABS_TABLE,
        Key: { memo_id, tab_id },
        ConditionExpression: 'attribute_exists(tab_id) AND version = :base',
        UpdateExpression:
          'SET title = :title, content = :content, byte_size = :bs, version = version + :one, updated_at = :now',
        ExpressionAttributeValues: {
          ':base': base_version,
          ':title': title,
          ':content': content,
          ':bs': byte_size,
          ':one': 1,
          ':now': now,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    // Lambda は応答後にプロセスが凍結されるため fire-and-forget にせず await する
    await touchMemo(memo_id, now);
    return { kind: 'ok', version: (updated.Attributes as Tab).version };
  } catch (err: unknown) {
    if ((err as { name?: string })?.name !== 'ConditionalCheckFailedException') throw err;
    // 不一致 or タブ消滅。現在値を強整合で読んで判別し、409 側にはサーバ値を渡す
    const cur = await docClient.send(
      new GetCommand({ TableName: TABS_TABLE, Key: { memo_id, tab_id }, ConsistentRead: true }),
    );
    const tab = cur.Item as Tab | undefined;
    if (!tab) return { kind: 'not_found' };
    return {
      kind: 'conflict',
      current: { title: tab.title, content: tab.content, version: tab.version },
    };
  }
}

export type CreateTabResult =
  | { kind: 'ok'; tab: Pick<Tab, 'tab_id' | 'title' | 'content' | 'version' | 'position'> }
  | { kind: 'limit' };

/** タブ追加。memos.tab_count の条件付きカウンタで上限を原子的に強制する。 */
export async function createTab(params: { memo_id: string; title: string }): Promise<CreateTabResult> {
  const { memo_id, title } = params;
  const tab_id = randomUUID();
  const now = new Date().toISOString();
  // 並び順は作成時刻ms。既存タブの後ろに付き、読み出し側は position 昇順で表示する
  const position = Date.now();

  try {
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: MEMOS_TABLE,
              Key: { memo_id },
              ConditionExpression: '#s = :active AND tab_count < :max',
              UpdateExpression: 'ADD tab_count :one SET updated_at = :now',
              ExpressionAttributeNames: { '#s': 'status' },
              ExpressionAttributeValues: {
                ':active': 'active',
                ':max': MAX_TABS_PER_MEMO,
                ':one': 1,
                ':now': now,
              },
            },
          },
          {
            Put: {
              TableName: TABS_TABLE,
              Item: {
                memo_id,
                tab_id,
                title,
                content: '',
                version: 0,
                position,
                byte_size: 0,
                created_at: now,
                updated_at: now,
              },
              ConditionExpression: 'attribute_not_exists(tab_id)',
            },
          },
        ],
      }),
    );
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'TransactionCanceledException') {
      return { kind: 'limit' }; // 上限 or メモ消滅。作成系はどちらも 409 扱いで十分
    }
    throw err;
  }

  return { kind: 'ok', tab: { tab_id, title, content: '', version: 0, position } };
}

export type DeleteTabResult = { kind: 'ok' } | { kind: 'last_tab' };

/** タブ削除。最後の1枚は消させない(空メモ化を防ぐ)。カウンタも同時に減算。 */
export async function deleteTab(params: { memo_id: string; tab_id: string }): Promise<DeleteTabResult> {
  const { memo_id, tab_id } = params;
  const now = new Date().toISOString();
  try {
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: MEMOS_TABLE,
              Key: { memo_id },
              ConditionExpression: '#s = :active AND tab_count > :one',
              UpdateExpression: 'ADD tab_count :minus SET updated_at = :now',
              ExpressionAttributeNames: { '#s': 'status' },
              ExpressionAttributeValues: { ':active': 'active', ':one': 1, ':minus': -1, ':now': now },
            },
          },
          {
            Delete: {
              TableName: TABS_TABLE,
              Key: { memo_id, tab_id },
              ConditionExpression: 'attribute_exists(tab_id)',
            },
          },
        ],
      }),
    );
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'TransactionCanceledException') {
      return { kind: 'last_tab' }; // 最後の1枚 or 既に無い。冪等に近い扱いで 409
    }
    throw err;
  }
  return { kind: 'ok' };
}

/** メモの更新時刻を進める(管理画面の「更新」表示用)。失敗しても保存は成功扱い。 */
async function touchMemo(memo_id: string, nowIso: string): Promise<void> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: MEMOS_TABLE,
        Key: { memo_id },
        ConditionExpression: 'attribute_exists(memo_id)',
        UpdateExpression: 'SET updated_at = :now',
        ExpressionAttributeValues: { ':now': nowIso },
      }),
    );
  } catch {
    // best-effort
  }
}
