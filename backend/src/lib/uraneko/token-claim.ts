import { QueryCommand, UpdateCommand, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../dynamo';
import type { VideoToken } from './types';

const TOKENS_TABLE = process.env.TOKENS_TABLE!;
// checkout 直後(入金前)の予約猶予。決済ページで送金を開始し、最初の検知が来るまでの時間。
// 放置(送金しないまま離脱)はこの時間で在庫へ戻す。
// 24時間に設定: 初心者は取引所の初回出金がセキュリティ審査で数時間〜翌日まで保留される
// ことが多く、短い猶予だと保留中に「期限切れ」表示になって不安を与える。長めに確保することで
// その間は在庫を押さえ続け、着金時にそのまま受け渡せる(表示上の失効を避ける)。
// なお失効後の遅延着金も webhook が expired/failed から復帰させる(fulfill の FORWARD_FROM)。
const RESERVATION_TTL_SEC_DEFAULT = 24 * 60 * 60;
const RESERVATION_TTL_SEC_BTC = 24 * 60 * 60;
export function initialReservationTtlSec(currency?: string): number {
  return (currency || '').toLowerCase() === 'btc'
    ? RESERVATION_TTL_SEC_BTC
    : RESERVATION_TTL_SEC_DEFAULT;
}
// 入金が検知(confirming)されたら、この長さに延長する。送金済み=ブロック確定待ちを吸収し、
// 確定前に失効して「支払ったのに売切」になるのを防ぐ。
const RESERVATION_CONFIRMING_TTL_SEC = 90 * 60;

/**
 * 指定 product に未割当(在庫)トークンが 1 件以上あるかを返す。
 * checkout の事前チェック用(在庫 0 で決済インボイスを発行しないため)。
 * Limit 1 + Select COUNT で GSI を1件だけ覗く軽量クエリ。
 */
export async function hasAvailableToken(product_id: string): Promise<boolean> {
  const q = await docClient.send(
    new QueryCommand({
      TableName: TOKENS_TABLE,
      IndexName: 'by_product_status',
      KeyConditionExpression: 'product_id = :pid AND begins_with(status_created_at, :prefix)',
      ExpressionAttributeValues: { ':pid': product_id, ':prefix': 'unassigned#' },
      Select: 'COUNT',
      Limit: 1,
    }),
  );
  return (q.Count ?? 0) > 0;
}

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

/**
 * 割当済みトークンを在庫(unassigned)へ戻す。
 * フルフィルが冪等性チェックで負けた(別実行が既に注文を確定した)際に、
 * 二重 claim したトークンを回収するためのベストエフォート処理。
 * 自分の order_id が割り当てた assigned トークンのみを対象にする。
 */
export async function releaseToken(
  token_id: string,
  created_at: string,
  order_id: string,
): Promise<void> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TOKENS_TABLE,
        Key: { token_id },
        ConditionExpression: '#s = :assigned AND order_id = :o',
        UpdateExpression:
          'SET #s = :unassigned, status_created_at = :sca, assigned_to = :null, assigned_at = :null, order_id = :null',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':assigned': 'assigned',
          ':unassigned': 'unassigned',
          ':o': order_id,
          ':sca': `unassigned#${created_at}`,
          ':null': null,
        },
      }),
    );
  } catch (err: unknown) {
    console.error('releaseToken failed (non-fatal):', (err as { name?: string })?.name);
  }
}

/**
 * checkout 時点で在庫トークンを1件「予約(reserved)」する。オーバーセル防止の要。
 * reserved は status_created_at が 'reserved#...' になり、以後の hasAvailableToken /
 * reserveToken(unassigned# のみ検索)から見えなくなる=在庫が即座に確保される。
 * 支払い確定で assignReservedToken、失敗/期限切れで releaseReservedToken に遷移する。
 */
export async function reserveToken(params: {
  product_id: string;
  order_id: string;
  ttlSec?: number; // 初期予約の猶予秒。未指定は既定(30分)
}): Promise<VideoToken | null> {
  const { product_id, order_id } = params;
  const ttlSec = params.ttlSec ?? RESERVATION_TTL_SEC_DEFAULT;
  const reservedUntil = new Date(Date.now() + ttlSec * 1000).toISOString();
  const q = await docClient.send(
    new QueryCommand({
      TableName: TOKENS_TABLE,
      IndexName: 'by_product_status',
      KeyConditionExpression: 'product_id = :pid AND begins_with(status_created_at, :prefix)',
      ExpressionAttributeValues: { ':pid': product_id, ':prefix': 'unassigned#' },
      Limit: 10,
    }),
  );
  const candidates = (q.Items as VideoToken[] | undefined) ?? [];
  for (const candidate of candidates) {
    try {
      const updated = await docClient.send(
        new UpdateCommand({
          TableName: TOKENS_TABLE,
          Key: { token_id: candidate.token_id },
          ConditionExpression: '#s = :unassigned',
          UpdateExpression:
            'SET #s = :reserved, status_created_at = :sca, order_id = :o, reserved_until = :ru',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: {
            ':unassigned': 'unassigned',
            ':reserved': 'reserved',
            ':sca': `reserved#${candidate.created_at}`,
            ':o': order_id,
            ':ru': reservedUntil,
          },
          ReturnValues: 'ALL_NEW',
        }),
      );
      return updated.Attributes as VideoToken;
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'ConditionalCheckFailedException') continue;
      throw err;
    }
  }
  return null;
}

/**
 * 予約トークンを assigned に確定する(reserved→assigned、当該注文の予約のみ)。
 * 支払い確定時に fulfill から呼ぶ。予約が既に別状態(解放/期限切れ再割当)なら null。
 */
export async function assignReservedToken(
  token_id: string,
  order_id: string,
  user_id: string,
): Promise<VideoToken | null> {
  const cur = (await docClient.send(new GetCommand({ TableName: TOKENS_TABLE, Key: { token_id } })))
    .Item as VideoToken | undefined;
  if (!cur || cur.status !== 'reserved' || cur.order_id !== order_id) return null;
  const now = new Date().toISOString();
  try {
    const updated = await docClient.send(
      new UpdateCommand({
        TableName: TOKENS_TABLE,
        Key: { token_id },
        ConditionExpression: '#s = :reserved AND order_id = :o',
        UpdateExpression:
          'SET #s = :assigned, status_created_at = :sca, assigned_to = :u, assigned_at = :t REMOVE reserved_until',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':reserved': 'reserved',
          ':assigned': 'assigned',
          ':sca': `assigned#${cur.created_at}`,
          ':u': user_id,
          ':t': now,
          ':o': order_id,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return updated.Attributes as VideoToken;
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'ConditionalCheckFailedException') return null;
    throw err;
  }
}

/** 予約トークンを在庫へ戻す(reserved→unassigned、当該注文の予約のみ)。決済失敗/期限切れ用。 */
export async function releaseReservedToken(token_id: string, order_id: string): Promise<void> {
  const cur = (await docClient.send(new GetCommand({ TableName: TOKENS_TABLE, Key: { token_id } })))
    .Item as VideoToken | undefined;
  if (!cur || cur.status !== 'reserved' || cur.order_id !== order_id) return;
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TOKENS_TABLE,
        Key: { token_id },
        ConditionExpression: '#s = :reserved AND order_id = :o',
        UpdateExpression:
          'SET #s = :unassigned, status_created_at = :sca, order_id = :null REMOVE reserved_until',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':reserved': 'reserved',
          ':unassigned': 'unassigned',
          ':sca': `unassigned#${cur.created_at}`,
          ':o': order_id,
          ':null': null,
        },
      }),
    );
  } catch (err: unknown) {
    if ((err as { name?: string })?.name !== 'ConditionalCheckFailedException') throw err;
  }
}

/**
 * 入金進行中(confirming)の予約を延長する。送金済みで確定待ちのトークンが、
 * 短い初期 TTL で失効するのを防ぐ。既に別状態(assigned/解放済/他注文)なら no-op。
 */
export async function extendReservation(token_id: string, order_id: string): Promise<void> {
  const until = new Date(Date.now() + RESERVATION_CONFIRMING_TTL_SEC * 1000).toISOString();
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TOKENS_TABLE,
        Key: { token_id },
        ConditionExpression: '#s = :reserved AND order_id = :o',
        UpdateExpression: 'SET reserved_until = :until',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':reserved': 'reserved', ':o': order_id, ':until': until },
      }),
    );
  } catch (err: unknown) {
    if ((err as { name?: string })?.name !== 'ConditionalCheckFailedException') throw err;
  }
}

/** 期限切れの予約トークンを列挙(cleanup Lambda 用)。Scan で reserved かつ reserved_until 経過分。 */
export async function listExpiredReservations(nowIso: string): Promise<VideoToken[]> {
  const items: VideoToken[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new ScanCommand({
        TableName: TOKENS_TABLE,
        FilterExpression: '#s = :reserved AND reserved_until < :now',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':reserved': 'reserved', ':now': nowIso },
        ExclusiveStartKey,
      }),
    );
    items.push(...((res.Items as VideoToken[] | undefined) ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (ExclusiveStartKey);
  return items;
}
