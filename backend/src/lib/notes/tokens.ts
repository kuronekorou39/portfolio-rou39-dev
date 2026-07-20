import { createHash, randomBytes, randomUUID } from 'crypto';
import { GetCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../dynamo';
import { MAX_MEMOS_PER_USER } from './limits';
import type { Memo, NotesToken, TokenMode } from './types';

const USERS_TABLE = process.env.USERS_TABLE!;
const MEMOS_TABLE = process.env.MEMOS_TABLE!;
const TABS_TABLE = process.env.TABS_TABLE!;
const TOKENS_TABLE = process.env.TOKENS_TABLE!;

/** トークンの権限モード。属性が無い旧トークンは 'rw' 扱い(後方互換)。 */
export function modeOf(token: Pick<NotesToken, 'mode'>): TokenMode {
  return token.mode === 'ro' ? 'ro' : 'rw';
}

/** mode に対応する memo 側のハッシュスロット属性名(解決/条件の照合鍵)。 */
function memoSlot(mode: TokenMode): 'active_token_hash' | 'active_readonly_token_hash' {
  return mode === 'ro' ? 'active_readonly_token_hash' : 'active_token_hash';
}

/** mode に対応する memo 側の生トークンスロット属性名(管理画面での再表示用)。 */
function memoRawSlot(mode: TokenMode): 'active_token_raw' | 'active_readonly_token_raw' {
  return mode === 'ro' ? 'active_readonly_token_raw' : 'active_token_raw';
}

const MAX_TX_ATTEMPTS = 5;
// 再試行で解消する一時的な取り消し理由。論理的な失敗(ConditionalCheckFailed)とは区別する。
const TRANSIENT_CANCEL_CODES = ['TransactionConflict', 'ThrottlingError', 'ProvisionedThroughputExceeded'];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * TransactWrite が「一時的な競合(=再試行で解消)」で取り消されたかを判定する。
 * 失効/再発行の TransactWrite は memo 行を更新するが、その memo 行は自動保存の touchMemo 等で
 * 非トランザクションに頻繁に書かれる。その並行書き込みと衝突すると DynamoDB は
 * TransactionConflict でトランザクション全体を取り消す(=何も書かれない)。これを
 * ConditionalCheckFailed(論理的にスロット/状態が既に変わっていた)と取り違えると、
 * 失効が「成功」と誤報告され漏れたURLが生き残る。理由コードを見て厳密に区別する。
 */
function isTransientCancel(err: unknown): boolean {
  const reasons = (err as { CancellationReasons?: { Code?: string }[] }).CancellationReasons;
  return !!reasons?.some((r) => r?.Code && TRANSIENT_CANCEL_CODES.includes(r.Code));
}

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
  // 有効期限切れは解決しない(可逆: レコードは残るので延長/無期限化で復活可能)。
  if (typeof token.url_expires_at === 'number' && Date.now() > token.url_expires_at) return null;
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
        // status=active かつ 未期限切れ かつ 間隔下限を満たす、を1回の条件付き更新で検証。
        ConditionExpression:
          '#s = :active AND (attribute_not_exists(#e) OR #e > :now) AND (attribute_not_exists(#f) OR #f <= :threshold)',
        UpdateExpression: 'SET #f = :now ADD save_count :one',
        ExpressionAttributeNames: { '#s': 'status', '#f': throttleField, '#e': 'url_expires_at' },
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
    // 期限切れは「頻度超過(429)」ではなく「無効(404)」に倒す(読み取り側と同じ扱い)。
    if (typeof token.url_expires_at === 'number' && Date.now() > token.url_expires_at) {
      return { kind: 'invalid' };
    }
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

export type SetExpiryResult = { ok: true } | { ok: false; reason: 'not_found' };

/**
 * 秘密URLの有効期限を設定/延長/クリアする(可逆)。expires_at_ms=null で無期限化(=復活)。
 *
 * revoke/reissue と違い token_hash も status もメモスロットも変えない。既存 token アイテムの
 * url_expires_at 属性を書き換えるだけなので、「同じURLのまま」期限切れ↔有効を往復できる。
 * 対象は現に active な URL のみ(スロットが token を指していない=revoke 済みや未発行は not_found)。
 * 単一アイテム更新なので TransactWrite は不要。
 */
export async function setTokenExpiry(params: {
  memo_id: string;
  owner_user_id: string;
  mode: TokenMode;
  expires_at_ms: number | null;
}): Promise<SetExpiryResult> {
  const memo = await getOwnedMemo(params.memo_id, params.owner_user_id);
  if (!memo) return { ok: false, reason: 'not_found' };
  const hash = memo[memoSlot(params.mode)];
  if (typeof hash !== 'string') return { ok: false, reason: 'not_found' }; // active な URL 無し

  const clearing = params.expires_at_ms === null;
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TOKENS_TABLE,
        Key: { token_hash: hash },
        // 念のためトークン側でも所有者と有効性を再確認(memo とトークンの owner は一致)。
        ConditionExpression: '#s = :active AND owner_user_id = :me',
        UpdateExpression: clearing ? 'REMOVE url_expires_at' : 'SET url_expires_at = :exp',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: clearing
          ? { ':active': 'active', ':me': params.owner_user_id }
          : { ':active': 'active', ':me': params.owner_user_id, ':exp': params.expires_at_ms },
      }),
    );
  } catch (err: unknown) {
    // トークンが並行操作で revoked 等に変わっていた
    if ((err as { name?: string })?.name === 'ConditionalCheckFailedException') {
      return { ok: false, reason: 'not_found' };
    }
    throw err;
  }
  return { ok: true };
}

export type ReissueResult =
  | { ok: true; rawToken: string }
  | { ok: false; reason: 'not_found' | 'conflict' };

/**
 * 秘密URLの発行/再発行(mode で編集用/読み取り専用を切り替え)。1回の TransactWrite で
 * 「新トークン作成 + 旧トークン失効 + memo の該当スロット差し替え」を原子的に行う。
 *
 * 読み取り専用は最初スロットが無い(=空)ため「発行」も「再発行」もこの1関数で兼ねる。
 * コミットした瞬間から旧URLは(解決が強整合 GetItem のため)次のリクエストで必ず 404。
 * memo 側スロットの「読み取り時の値と一致」条件が並行する再発行/失効との競合を排除する
 * (負けた方は TransactionCanceled → conflict)。編集用と読み取り専用は別スロットなので
 * 互いに影響しない。
 */
export async function reissueToken(params: {
  memo_id: string;
  owner_user_id: string;
  mode: TokenMode;
}): Promise<ReissueResult> {
  // TransactionConflict(自動保存等との一時的な衝突)は再試行。毎回 memo を読み直して
  // スロットの現在値で条件を組み直す。ConditionalCheckFailed(並行再発行に敗北)は conflict。
  for (let attempt = 0; attempt < MAX_TX_ATTEMPTS; attempt++) {
    const memo = await getOwnedMemo(params.memo_id, params.owner_user_id);
    if (!memo) return { ok: false, reason: 'not_found' };

    const slot = memoSlot(params.mode);
    const rawSlot = memoRawSlot(params.mode);
    const oldHash = memo[slot]; // string | null | undefined
    const rawToken = generateToken();
    const newHash = hashToken(rawToken);
    const now = new Date().toISOString();

    // スロットの現在値(hash / null / 未設定)を厳密に条件化し、並行変更に負けたら中止する。
    const memoValues: Record<string, unknown> = {
      ':me': params.owner_user_id,
      ':active': 'active',
      ':new': newHash,
      ':newraw': rawToken,
      ':now': now,
    };
    let slotCond: string;
    if (typeof oldHash === 'string') {
      slotCond = '#slot = :old';
      memoValues[':old'] = oldHash;
    } else if (oldHash === null) {
      slotCond = '#slot = :nullv';
      memoValues[':nullv'] = null;
    } else {
      slotCond = 'attribute_not_exists(#slot)';
    }

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
            mode: params.mode,
            issued_at: now,
          },
          ConditionExpression: 'attribute_not_exists(token_hash)',
        },
      },
      {
        Update: {
          TableName: MEMOS_TABLE,
          Key: { memo_id: memo.memo_id },
          ConditionExpression: `owner_user_id = :me AND #s = :active AND ${slotCond}`,
          UpdateExpression: 'SET #slot = :new, #rawslot = :newraw, updated_at = :now',
          ExpressionAttributeNames: { '#s': 'status', '#slot': slot, '#rawslot': rawSlot },
          ExpressionAttributeValues: memoValues,
        },
      },
    ];
    if (typeof oldHash === 'string') {
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
      return { ok: true, rawToken };
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'TransactionCanceledException') throw err;
      if (isTransientCancel(err)) {
        await sleep(40 * (attempt + 1));
        continue; // memo を読み直して再試行
      }
      return { ok: false, reason: 'conflict' }; // 並行再発行/失効に敗北(論理的競合)
    }
  }
  return { ok: false, reason: 'conflict' }; // 一時競合が継続
}

export type RevokeResult = { ok: true } | { ok: false; reason: 'not_found' | 'conflict' };

/**
 * 秘密URLの失効(代替を発行しない)。mode で編集用/読み取り専用を選ぶ。
 * 既に失効済み(スロットが null / 未設定)なら no-op 成功(冪等)。
 *
 * 【重要】キルスイッチなので fail-open させないこと。TransactionConflict(自動保存等との
 * 一時衝突=何も書かれていない)は再試行し、決して「成功」と誤報告しない。
 * ConditionalCheckFailed(対象トークンが既に失効/スロットが並行操作で変化=消したいURLは
 * 既に死んでいる)のみ冪等成功として扱う。
 */
export async function revokeToken(params: {
  memo_id: string;
  owner_user_id: string;
  mode: TokenMode;
}): Promise<RevokeResult> {
  for (let attempt = 0; attempt < MAX_TX_ATTEMPTS; attempt++) {
    const memo = await getOwnedMemo(params.memo_id, params.owner_user_id);
    if (!memo) return { ok: false, reason: 'not_found' };
    const slot = memoSlot(params.mode);
    const rawSlot = memoRawSlot(params.mode);
    const oldHash = memo[slot];
    if (typeof oldHash !== 'string') return { ok: true }; // 既に無効(null / 未設定)

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
                ConditionExpression: 'owner_user_id = :me AND #slot = :old',
                UpdateExpression: 'SET #slot = :null, #rawslot = :null, updated_at = :now',
                ExpressionAttributeNames: { '#slot': slot, '#rawslot': rawSlot },
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
      return { ok: true };
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'TransactionCanceledException') throw err;
      if (isTransientCancel(err)) {
        await sleep(40 * (attempt + 1));
        continue; // 何も書かれていない。memo を読み直して再試行
      }
      // ConditionalCheckFailed(一時競合でない): 対象は既に失効、またはスロットが並行操作で
      // 変化 = 消したかったURLは既に死んでいる。冪等成功。
      return { ok: true };
    }
  }
  return { ok: false, reason: 'conflict' }; // 一時競合が継続=失効できていない(fail-open しない)
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
                active_token_raw: rawToken, // 管理画面での URL 再表示用
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
                mode: 'rw', // 発行時の秘密URLは編集用
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
