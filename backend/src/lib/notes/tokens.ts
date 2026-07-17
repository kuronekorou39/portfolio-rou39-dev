import { createHash, randomBytes, randomUUID } from 'crypto';
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../dynamo';
import { MAX_MEMOS_PER_USER } from './limits';
import type { NotesToken } from './types';

const USERS_TABLE = process.env.USERS_TABLE!;
const MEMOS_TABLE = process.env.MEMOS_TABLE!;
const TABS_TABLE = process.env.TABS_TABLE!;
const TOKENS_TABLE = process.env.TOKENS_TABLE!;

/**
 * 秘密URLトークンを生成する(256bit 乱数 → base64url 43文字)。
 * この生値は URL フラグメントに載せて発行レスポンスで1度だけ返し、どこにも保存しない。
 */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * トークンの保存用ハッシュ(SHA-256 のフル64hex)。
 * 256bit 一様乱数が入力なので salt/pepper は不要(テーブルが漏れても逆算不能)。
 * uraneko order-token.ts の .slice(0,32) のような切り詰めはしないこと。
 */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * 秘密URLトークンを解決する。
 *
 * 必ず PK(token_hash)への ConsistentRead GetItem で行う(強整合)。
 * これにより再発行/失効の TransactWrite がコミットした直後の次リクエストから
 * 確実に無効(null)になる。GSI 経由の解決は結果整合のため禁止。
 *
 * 未知・失効の区別は呼び出し側に返さない(どちらも null)。
 */
export async function resolveToken(raw: string): Promise<NotesToken | null> {
  const res = await docClient.send(
    new GetCommand({
      TableName: TOKENS_TABLE,
      Key: { token_hash: hashToken(raw) },
      ConsistentRead: true,
    }),
  );
  const token = res.Item as NotesToken | undefined;
  if (!token || token.status !== 'active') return null;
  return token;
}

export type IssueResult =
  | { ok: true; memo_id: string; rawToken: string }
  | { ok: false; reason: 'limit' };

/**
 * メモを新規発行する。1回の TransactWrite で以下を原子的に行う:
 *   1. notes-users の memo_count を予約(上限未満の条件付き ADD。行が無ければ作成)
 *   2. notes-memos にメモ本体を作成
 *   3. notes-tokens に秘密URLトークン(ハッシュ)を作成
 *   4. notes-tabs に最初の空タブを作成(メモ画面を開いてすぐ書けるように)
 * どれか1つでも失敗すれば全体が巻き戻る(上限超過で何も作られない、を保証)。
 */
export async function issueMemo(params: {
  owner_user_id: string;
  title: string;
}): Promise<IssueResult> {
  const { owner_user_id, title } = params;
  const memo_id = randomUUID();
  const tab_id = randomUUID();
  const rawToken = generateToken();
  const token_hash = hashToken(rawToken);
  const now = new Date().toISOString();

  try {
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            // 無料枠カウンタの予約(coupon.ts reserveRedemption と同じ条件付きカウンタ)。
            // 初回発行時は行が無いので attribute_not_exists でも通す(ADD が行を作る)。
            Update: {
              TableName: USERS_TABLE,
              Key: { user_id: owner_user_id },
              ConditionExpression: 'attribute_not_exists(user_id) OR memo_count < :cap',
              UpdateExpression: 'ADD memo_count :one',
              ExpressionAttributeValues: { ':cap': MAX_MEMOS_PER_USER, ':one': 1 },
            },
          },
          {
            Put: {
              TableName: MEMOS_TABLE,
              Item: {
                memo_id,
                owner_user_id,
                title,
                active_token_hash: token_hash,
                tab_count: 1,
                status: 'active',
                created_at: now,
                updated_at: now,
              },
              ConditionExpression: 'attribute_not_exists(memo_id)',
            },
          },
          {
            Put: {
              TableName: TOKENS_TABLE,
              Item: {
                token_hash,
                memo_id,
                owner_user_id,
                status: 'active',
                issued_at: now,
              },
              // 256bit 乱数の衝突は事実上起きないが、起きた場合に既存トークンを
              // 上書きして他人のメモへ付け替わる事故だけは条件で確実に防ぐ
              ConditionExpression: 'attribute_not_exists(token_hash)',
            },
          },
          {
            Put: {
              TableName: TABS_TABLE,
              Item: {
                memo_id,
                tab_id,
                title: '',
                content: '',
                version: 0,
                position: 0,
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
      const reasons = (err as { CancellationReasons?: { Code?: string }[] }).CancellationReasons;
      // 先頭(users のカウンタ条件)の失敗 = 無料枠上限
      if (reasons?.[0]?.Code === 'ConditionalCheckFailed') {
        return { ok: false, reason: 'limit' };
      }
    }
    throw err;
  }

  return { ok: true, memo_id, rawToken };
}
