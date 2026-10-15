import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand, BatchGetCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../lib/dynamo';
import { ok, forbidden, serverError } from '../../lib/response';
import { limitsFor, isPlan, type Plan } from '../../lib/notes/limits';
import type { Memo, NotesUserQuota } from '../../lib/notes/types';

const USERS_TABLE = process.env.USERS_TABLE!;
const MEMOS_TABLE = process.env.MEMOS_TABLE!;
const TOKENS_TABLE = process.env.TOKENS_TABLE!;
const SITE_BASE_URL = process.env.NOTES_SITE_URL!; // https://notes.rou39.com

/** 生トークンから秘密URLを組み立てる(保存済みの場合のみ)。 */
function urlOf(raw: string | null | undefined): string | null {
  return typeof raw === 'string' && raw ? `${SITE_BASE_URL}/m#${raw}` : null;
}

/**
 * 各メモの active な token_hash から有効期限(url_expires_at)を引く。
 * 期限は token アイテム側にあり memos 行には無いので join が要る。管理画面表示専用。
 * BatchGet は 100 件/回。スロットル時の UnprocessedKeys は再キューして取りこぼさない
 * (guard で無限ループを防止)。実際の失効判定は resolveToken 側が権威。
 */
async function fetchExpiryByHash(hashes: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const queue = [...hashes];
  let guard = 0;
  while (queue.length > 0 && guard < 20) {
    guard++;
    const chunk = queue.splice(0, 100);
    const resp = await docClient.send(
      new BatchGetCommand({
        RequestItems: {
          [TOKENS_TABLE]: {
            Keys: chunk.map((h) => ({ token_hash: h })),
            ProjectionExpression: 'token_hash, url_expires_at',
          },
        },
      }),
    );
    const rows = (resp.Responses?.[TOKENS_TABLE] ?? []) as {
      token_hash: string;
      url_expires_at?: number;
    }[];
    for (const r of rows) {
      if (typeof r.url_expires_at === 'number') map.set(r.token_hash, r.url_expires_at);
    }
    // 未処理キー(スロットル)は次の周回で再取得する
    const unprocessed = (resp.UnprocessedKeys?.[TOKENS_TABLE]?.Keys ?? []) as { token_hash: string }[];
    for (const k of unprocessed) queue.push(k.token_hash);
  }
  return map;
}

/** 所有メモを新しい順に全件(削除済み行も GSI に残るので、上限件数ではなくページングで辿る)。 */
async function listOwnedMemos(owner_user_id: string): Promise<Memo[]> {
  const memos: Memo[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: MEMOS_TABLE,
        IndexName: 'by_owner',
        KeyConditionExpression: 'owner_user_id = :u',
        ExpressionAttributeValues: { ':u': owner_user_id },
        ScanIndexForward: false, // 新しい順
        ExclusiveStartKey,
      }),
    );
    memos.push(...((res.Items as Memo[] | undefined) ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (ExclusiveStartKey);
  return memos.filter((m) => m.status !== 'deleted');
}

/**
 * プランのタブ上限をメモに刻み直す(プラン変更後の追従)。
 * 未認証の create-tab は users を読めないので上限は memos.tab_limit で持つ。運営者がプランを
 * 変えたあと、所有者が管理画面を開いたときにここで揃える。所有者+active の条件付きなので
 * 他人のメモや削除済みには触らない。失敗しても一覧表示は続ける(次回また試す)。
 */
async function restampTabLimit(memos: Memo[], owner_user_id: string, tabs: number): Promise<void> {
  const stale = memos.filter((m) => m.tab_limit !== tabs);
  await Promise.all(
    stale.map((m) =>
      docClient
        .send(
          new UpdateCommand({
            TableName: MEMOS_TABLE,
            Key: { memo_id: m.memo_id },
            ConditionExpression: 'owner_user_id = :me AND #s = :active',
            UpdateExpression: 'SET tab_limit = :limit',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: { ':me': owner_user_id, ':active': 'active', ':limit': tabs },
          }),
        )
        .then(() => {
          m.tab_limit = tabs; // 応答にも反映
        })
        .catch((err: unknown) => {
          console.error('restamp tab_limit failed:', (err as { name?: string })?.name);
        }),
    ),
  );
}

/**
 * GET /admin/memos — 自分のメモ一覧(新しい順、Cognito オーソライザー必須)。
 * 応答にはプランと上限も載せる(管理画面の「残り作成数」「プラン表示」用)。
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userSub = event.requestContext.authorizer?.claims?.sub as string | undefined;
    if (!userSub) return forbidden('login_required');

    const [userRes, memos] = await Promise.all([
      docClient.send(new GetCommand({ TableName: USERS_TABLE, Key: { user_id: userSub } })),
      listOwnedMemos(userSub),
    ]);
    const user = userRes.Item as NotesUserQuota | undefined;
    const plan: Plan = isPlan(user?.plan) ? user.plan : 'free';
    const limits = limitsFor(plan);

    // 各メモの active な token_hash を集めて有効期限をまとめて引く。刻印の追従も同時に走らせる
    const hashes: string[] = [];
    for (const m of memos) {
      if (m.active_token_hash) hashes.push(m.active_token_hash);
      if (m.active_readonly_token_hash) hashes.push(m.active_readonly_token_hash);
    }
    const [expiryByHash] = await Promise.all([
      fetchExpiryByHash(hashes),
      restampTabLimit(memos, userSub, limits.tabs),
    ]);
    const now = Date.now();
    const expIso = (ms: number | undefined) =>
      typeof ms === 'number' ? new Date(ms).toISOString() : null;

    const items = memos.map((m) => {
      const rwExp = m.active_token_hash ? expiryByHash.get(m.active_token_hash) : undefined;
      const roExp = m.active_readonly_token_hash
        ? expiryByHash.get(m.active_readonly_token_hash)
        : undefined;
      return {
        memo_id: m.memo_id,
        title: m.title,
        has_active_url: !!m.active_token_hash,
        has_readonly_url: !!m.active_readonly_token_hash,
        has_pin: !!m.pin_hash,
        // 秘密URL(生トークン保存済みなら再表示。旧メモは null=再発行で表示)
        url: urlOf(m.active_token_raw),
        readonly_url: urlOf(m.active_readonly_token_raw),
        // 有効期限(ISO or null=無期限)と、サーバ時刻基準の期限切れ真偽
        url_expires_at: expIso(rwExp),
        url_expired: typeof rwExp === 'number' && now > rwExp,
        readonly_url_expires_at: expIso(roExp),
        readonly_url_expired: typeof roExp === 'number' && now > roExp,
        tab_count: m.tab_count,
        tab_limit: m.tab_limit ?? limits.tabs,
        created_at: m.created_at,
        updated_at: m.updated_at,
      };
    });

    return ok({ plan, limits, memos: items });
  } catch (err) {
    console.error('list-memos error:', err);
    return serverError();
  }
}
