import { createHash, randomBytes, randomUUID } from 'crypto';
import { GetCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../dynamo';
import { MAX_MEMOS_PER_USER } from './limits';
import type { Memo, NotesToken } from './types';

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

export type ThrottledResolveResult =
  | { kind: 'ok'; token: NotesToken }
  | { kind: 'invalid' } // 未知・失効(呼び出し側は一律404にする)
  | { kind: 'throttled' }; // 間隔下限未満(429)

/**
 * 書き込み系(保存/フラッシュ)用のトークン解決。
 * 「有効なトークンであること」と「間隔下限を満たすこと」を、トークンアイテムへの
 * 1回の条件付き Update で同時に検証・消費する(競合しても原子的)。
 *
 * throttleField を分けることで、保存(last_save_ms)と退出フラッシュ(last_flush_ms)
 * の窓を独立させている。失敗時は GetItem で「無効(404)」か「頻度超過(429)」かを
 * 判別するが、レスポンス上は 404 を一律にして有効性のオラクルにしない。
 */
export async function resolveTokenThrottled(
  raw: string,
  throttleField: 'last_save_ms' | 'last_flush_ms',
  minIntervalMs: number,
): Promise<ThrottledResolveResult> {
  const token_hash = hashToken(raw);
  const now = Date.now();
  try {
    const updated = await docClient.send(
      new UpdateCommand({
        TableName: TOKENS_TABLE,
        Key: { token_hash },
        ConditionExpression:
          '#s = :active AND (attribute_not_exists(#f) OR #f <= :threshold)',
        UpdateExpression: 'SET #f = :now ADD save_count :one',
        ExpressionAttributeNames: { '#s': 'status', '#f': throttleField },
        ExpressionAttributeValues: {
          ':active': 'active',
          ':threshold': now - minIntervalMs,
          ':now': now,
          ':one': 1,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return { kind: 'ok', token: updated.Attributes as NotesToken };
  } catch (err: unknown) {
    if ((err as { name?: string })?.name !== 'ConditionalCheckFailedException') throw err;
    // 条件不成立の理由を判別(この GetItem は強整合)
    const cur = await docClient.send(
      new GetCommand({ TableName: TOKENS_TABLE, Key: { token_hash }, ConsistentRead: true }),
    );
    const token = cur.Item as NotesToken | undefined;
    if (!token || token.status !== 'active') return { kind: 'invalid' };
    return { kind: 'throttled' };
  }
}

export type IssueResult =
  | { ok: true; memo_id: string; rawToken: string }
  | { ok: false; reason: 'limit' };

/** 所有者チェック込みでメモを強整合読みする(管理系操作の共通前段)。 */
export async function getOwnedMemo(memo_id: string, owner_user_id: string): Promise<Memo | null> {
  const res = await docClient.send(
    new GetCommand({ TableName: MEMOS_TABLE, Key: { memo_id }, ConsistentRead: true }),
  );
  const memo = res.Item as Memo | undefined;
  if (!memo || memo.status !== 'active' || memo.owner_user_id !== owner_user_id) return null;
  return memo;
}

export type ReissueResult =
  | { ok: true; rawToken: string }
  | { ok: false; reason: 'not_found' | 'conflict' };

/**
 * 秘密URLの再発行。1回の TransactWrite で「新トークン作成 + 旧トークン失効 +
 * memo.active_token_hash 差し替え」を原子的に行う。
 *
 * コミットした瞬間から旧URLは(解決が強整合 GetItem のため)次のリクエストで必ず 404。
 * memo 側の条件(active_token_hash = 読み取り時の値)が二重再発行の競合を防ぐ
 * (負けた方は TransactionCanceled → conflict)。
 */
export async function reissueToken(params: {
  memo_id: string;
  owner_user_id: string;
}): Promise<ReissueResult> {
  const memo = await getOwnedMemo(params.memo_id, params.owner_user_id);
  if (!memo) return { ok: false, reason: 'not_found' };

  const oldHash = memo.active_token_hash;
  const rawToken = generateToken();
  const newHash = hashToken(rawToken);
  const now = new Date().toISOString();

  const items: NonNullable<
    ConstructorParameters<typeof TransactWriteCommand>[0]['TransactItems']
  > = [
    {
      Put: {
        TableName: TOKENS_TABLE,
        Item: {
          token_hash: newHash,
          memo_id: memo.memo_id,
          owner_user_id: params.owner_user_id,
          status: 'active',
          issued_at: now,
        },
        ConditionExpression: 'attribute_not_exists(token_hash)',
      },
    },
    {
      Update: {
        TableName: MEMOS_TABLE,
        Key: { memo_id: memo.memo_id },
        // 読み取り時の active_token_hash と一致する場合のみ = 並行する再発行/失効に負けたら中止
        ConditionExpression:
          'owner_user_id = :me AND #s = :active AND active_token_hash = :old',
        UpdateExpression: 'SET active_token_hash = :new, updated_at = :now',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':me': params.owner_user_id,
          ':active': 'active',
          ':old': oldHash,
          ':new': newHash,
          ':now': now,
        },
      },
    },
  ];
  if (oldHash) {
    items.push({
      Update: {
        TableName: TOKENS_TABLE,
        Key: { token_hash: oldHash },
        ConditionExpression: '#s = :active',
        UpdateExpression: 'SET #s = :revoked, revoked_at = :now',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':active': 'active', ':revoked': 'revoked', ':now': now },
      },
    });
  }

  try {
    await docClient.send(new TransactWriteCommand({ TransactItems: items }));
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'TransactionCanceledException') {
      return { ok: false, reason: 'conflict' };
    }
    throw err;
  }
  return { ok: true, rawToken };
}

/**
 * 秘密URLの失効(代替を発行しない)。既に失効済みなら no-op 成功(冪等)。
 */
export async function revokeToken(params: {
  memo_id: string;
  owner_user_id: string;
}): Promise<{ ok: boolean }> {
  const memo = await getOwnedMemo(params.memo_id, params.owner_user_id);
  if (!memo) return { ok: false };
  const oldHash = memo.active_token_hash;
  if (!oldHash) return { ok: true }; // 既に無効

  const now = new Date().toISOString();
  try {
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: TOKENS_TABLE,
              Key: { token_hash: oldHash },
              ConditionExpression: '#s = :active',
              UpdateExpression: 'SET #s = :revoked, revoked_at = :now',
              ExpressionAttributeNames: { '#s': 'status' },
              ExpressionAttributeValues: { ':active': 'active', ':revoked': 'revoked', ':now': now },
            },
          },
          {
            Update: {
              TableName: MEMOS_TABLE,
              Key: { memo_id: memo.memo_id },
              ConditionExpression: 'owner_user_id = :me AND active_token_hash = :old',
              UpdateExpression: 'SET active_token_hash = :null, updated_at = :now',
              ExpressionAttributeValues: {
                ':me': params.owner_user_id,
                ':old': oldHash,
                ':null': null,
                ':now': now,
              },
            },
          },
        ],
      }),
    );
  } catch (err: unknown) {
    // 並行操作(再発行等)と競合した場合は現状を尊重して失敗にしない
    if ((err as { name?: string })?.name === 'TransactionCanceledException') return { ok: true };
    throw err;
  }
  return { ok: true };
}

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
