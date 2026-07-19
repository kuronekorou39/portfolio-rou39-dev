import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../dynamo';
import { unauthorized, tooManyRequests } from '../response';
import { noStore } from './http';

const MEMOS_TABLE = process.env.MEMOS_TABLE!;
const TOKENS_TABLE = process.env.TOKENS_TABLE!;

// PIN の桁数許容(6〜10桁の数字)。低エントロピーなのでオンラインのロックが本命の防御。
// 最小6桁(=100万通り): 5回/5分のロック下で総当たりは平均~1年。4桁だと~3.5日で割れる。
export const PIN_MIN_LEN = 6;
export const PIN_MAX_LEN = 10;

// 試行ロック: トークン単位で連続失敗を数え、上限でロックする。
const PIN_MAX_FAILS = 5;
const PIN_LOCK_MS = 5 * 60 * 1000; // 5分

const SCRYPT_KEYLEN = 32;

/** PIN のハッシュ(scrypt, salt付き)。保存形式 "salthex:hashhex"。 */
export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const dk = scryptSync(pin, salt, SCRYPT_KEYLEN);
  return `${salt.toString('hex')}:${dk.toString('hex')}`;
}

/** 保存済みハッシュと PIN を timing-safe に照合する。 */
export function verifyPinHash(pin: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(pin, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isValidPinFormat(pin: unknown): pin is string {
  return typeof pin === 'string' && /^[0-9]+$/.test(pin) && pin.length >= PIN_MIN_LEN && pin.length <= PIN_MAX_LEN;
}

/** メモの PIN を設定/変更(所有者のみ)。 */
export async function setMemoPin(params: {
  memo_id: string;
  owner_user_id: string;
  pin: string;
}): Promise<{ ok: boolean }> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: MEMOS_TABLE,
        Key: { memo_id: params.memo_id },
        ConditionExpression: 'owner_user_id = :me AND #s = :active',
        UpdateExpression: 'SET pin_hash = :h, updated_at = :now',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':me': params.owner_user_id,
          ':active': 'active',
          ':h': hashPin(params.pin),
          ':now': new Date().toISOString(),
        },
      }),
    );
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'ConditionalCheckFailedException') return { ok: false };
    throw err;
  }
  return { ok: true };
}

/** メモの PIN を解除(所有者のみ)。 */
export async function clearMemoPin(params: {
  memo_id: string;
  owner_user_id: string;
}): Promise<{ ok: boolean }> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: MEMOS_TABLE,
        Key: { memo_id: params.memo_id },
        ConditionExpression: 'owner_user_id = :me AND #s = :active',
        UpdateExpression: 'REMOVE pin_hash SET updated_at = :now',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':me': params.owner_user_id,
          ':now': new Date().toISOString(),
        },
      }),
    );
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'ConditionalCheckFailedException') return { ok: false };
    throw err;
  }
  return { ok: true };
}

export type PinCheckResult = 'ok' | 'required' | 'incorrect' | 'locked';

/** 失敗カウンタ/ロックをリセット(成功時。best-effort)。 */
async function resetPinFails(token_hash: string): Promise<void> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TOKENS_TABLE,
        Key: { token_hash },
        UpdateExpression: 'REMOVE pin_fail_count, pin_locked_until',
      }),
    );
  } catch {
    /* best-effort */
  }
}

/**
 * 照合の【前に】試行枠を原子的に1つ確保する(reserve-before-verify)。条件付き ADD は
 * DynamoDB が直列化するので、同時多発リクエストでもロック上限を超えて試行できない。
 *
 * 自己回復: 予約が弾かれたとき、有効なロックが無いのにカウンタが上限に達している
 * (=ロック設定の書き込みが一時失敗して取り残された不整合)なら、カウンタを消して1回だけ
 * 再予約する。これにより「恒久ブロック(正しいPINでも開けない)」を防ぐ。
 */
async function reserveAttempt(
  token_hash: string,
  now: number,
): Promise<'locked' | { count: number }> {
  const doReserve = () =>
    docClient.send(
      new UpdateCommand({
        TableName: TOKENS_TABLE,
        Key: { token_hash },
        ConditionExpression:
          '(attribute_not_exists(pin_locked_until) OR pin_locked_until <= :now) AND (attribute_not_exists(pin_fail_count) OR pin_fail_count < :max)',
        UpdateExpression: 'ADD pin_fail_count :one',
        ExpressionAttributeValues: { ':now': now, ':max': PIN_MAX_FAILS, ':one': 1 },
        ReturnValues: 'ALL_NEW',
      }),
    );

  try {
    const res = await doReserve();
    return { count: Number((res.Attributes as { pin_fail_count?: number })?.pin_fail_count ?? 1) };
  } catch (err: unknown) {
    if ((err as { name?: string })?.name !== 'ConditionalCheckFailedException') throw err;
    // 弾かれた理由を判定
    const st = (
      await docClient.send(
        new GetCommand({ TableName: TOKENS_TABLE, Key: { token_hash }, ConsistentRead: true }),
      )
    ).Item as { pin_locked_until?: number } | undefined;
    if (st?.pin_locked_until && st.pin_locked_until > now) return 'locked'; // 正当なロック中
    // 有効なロックが無いのに上限超過 = 取り残された不整合。カウンタを消して1回だけ再試行させる。
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TOKENS_TABLE,
          Key: { token_hash },
          UpdateExpression: 'REMOVE pin_fail_count, pin_locked_until',
        }),
      );
      const res2 = await doReserve();
      return { count: Number((res2.Attributes as { pin_fail_count?: number })?.pin_fail_count ?? 1) };
    } catch {
      return 'locked';
    }
  }
}

/**
 * 書き込み系ハンドラ用の PIN ゲート。memo の pin_hash を取得して照合し、
 * ok 以外なら適切な no-store レスポンス(401/429)を返す。ok(通過)なら null。
 */
export async function pinGateResponse(
  memo_id: string,
  token_hash: string,
  tokenState: { pin_locked_until?: number; pin_fail_count?: number },
  pin: unknown,
) {
  const res = await checkMemoPin({
    memo_pin_hash: await getMemoPinHash(memo_id),
    token_hash,
    tokenState,
    pin,
  });
  if (res === 'locked') return noStore(tooManyRequests('pin_locked'));
  if (res === 'required') return noStore(unauthorized('pin_required'));
  if (res === 'incorrect') return noStore(unauthorized('pin_incorrect'));
  return null;
}

/** memo の pin_hash を取得(書き込み系ハンドラ用。memo は既に読んでいる場合は直接 checkMemoPin へ)。 */
export async function getMemoPinHash(memo_id: string): Promise<string | null> {
  const res = await docClient.send(
    new GetCommand({
      TableName: MEMOS_TABLE,
      Key: { memo_id },
      ProjectionExpression: 'pin_hash',
    }),
  );
  return (res.Item as { pin_hash?: string | null } | undefined)?.pin_hash ?? null;
}

/**
 * メモ画面アクセス時の PIN チェック。pin_hash が無ければ 'ok'(PIN未設定)。
 * ある場合、pin が正しければ 'ok'、未提示なら 'required'、誤りなら 'incorrect'。
 *
 * オンライン総当たり対策: トークンアイテムに失敗回数(pin_fail_count)とロック期限
 * (pin_locked_until)を持たせ、上限でロックする。トークン単位なので、URLが漏れて
 * 総当たりされても、そのトークンのロックだけで他URL/他メモに波及しない。
 *
 * tokenState を渡せばロック確認の GetItem を省ける(呼び元が既にトークンを解決している場合)。
 */
export async function checkMemoPin(params: {
  memo_pin_hash: string | null | undefined;
  token_hash: string;
  tokenState?: { pin_locked_until?: number; pin_fail_count?: number };
  pin: unknown;
}): Promise<PinCheckResult> {
  const { memo_pin_hash, token_hash, pin } = params;
  if (!memo_pin_hash) return 'ok'; // PIN 未設定

  const now = Date.now();

  // PIN 未提示: 試行枠は消費せず、ロック中か否かだけ返す(初回ロード表示用)。
  if (typeof pin !== 'string' || !pin) {
    let state = params.tokenState;
    if (!state) {
      state = (
        await docClient.send(
          new GetCommand({ TableName: TOKENS_TABLE, Key: { token_hash }, ConsistentRead: true }),
        )
      ).Item as { pin_locked_until?: number } | undefined;
    }
    return state?.pin_locked_until && state.pin_locked_until > now ? 'locked' : 'required';
  }

  // PIN 提示: まず試行枠を原子的に確保(自己回復付き)。
  const reserved = await reserveAttempt(token_hash, now);
  if (reserved === 'locked') return 'locked';
  const count = reserved.count;

  if (verifyPinHash(pin, memo_pin_hash)) {
    await resetPinFails(token_hash); // best-effort
    return 'ok';
  }

  // 誤り: 上限に達したら即時ロック(best-effort)。仮にこの書き込みが失われても、
  // 次回 reserveAttempt が「有効なロックが無いのに上限超過」を検出して自己回復するので
  // 恒久ブロックにはならない。
  if (count >= PIN_MAX_FAILS) {
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TOKENS_TABLE,
          Key: { token_hash },
          UpdateExpression: 'SET pin_locked_until = :until REMOVE pin_fail_count',
          ExpressionAttributeValues: { ':until': now + PIN_LOCK_MS },
        }),
      );
    } catch {
      /* best-effort。self-heal が保険 */
    }
    return 'locked';
  }
  return 'incorrect';
}
