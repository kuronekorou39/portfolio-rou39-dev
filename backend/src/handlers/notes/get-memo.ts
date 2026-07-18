import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../lib/dynamo';
import { ok, notFound, serverError } from '../../lib/response';
import { noStore } from '../../lib/notes/http';
import { resolveToken } from '../../lib/notes/tokens';
import { recordViewCoalesced, listAccess } from '../../lib/notes/access-log';
import type { Memo, Tab } from '../../lib/notes/types';

const MEMOS_TABLE = process.env.MEMOS_TABLE!;
const TABS_TABLE = process.env.TABS_TABLE!;

/**
 * POST /m/get — 秘密URLトークンでメモ本体+全タブを取得(オーソライザー無し)。
 *
 * トークンは POST body でのみ受け取る(path/query に載せるとアクセスログや
 * ブラウザ履歴に残るため)。未知・失効・削除済みはすべて同一の 404 を返し、
 * トークンの有効性を探るオラクルにしない。生トークンや body はログに出さない。
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    let token: unknown;
    try {
      token = JSON.parse(event.body || '{}').token;
    } catch {
      return noStore(notFound());
    }
    if (typeof token !== 'string' || !token) return noStore(notFound());

    const resolved = await resolveToken(token);
    if (!resolved) return noStore(notFound());

    const memoRes = await docClient.send(
      new GetCommand({ TableName: MEMOS_TABLE, Key: { memo_id: resolved.memo_id } }),
    );
    const memo = memoRes.Item as Memo | undefined;
    if (!memo || memo.status !== 'active') return noStore(notFound());

    // 閲覧を記録(トークン単位で10分coalesce・best-effort)。
    // 「誰がいつ開いたか」をメモ画面に出すのが、E2E暗号化しない代わりの受容策。
    await recordViewCoalesced({ token_hash: resolved.token_hash, memo_id: memo.memo_id, event });

    // 全タブ取得。MAX_TABS_PER_MEMO × TAB_CAP_BYTES ≤ 約1MB に制約しているため
    // Query 1ページに必ず収まる(limits.ts 参照)。
    const tabsRes = await docClient.send(
      new QueryCommand({
        TableName: TABS_TABLE,
        KeyConditionExpression: 'memo_id = :m',
        ExpressionAttributeValues: { ':m': resolved.memo_id },
      }),
    );
    const tabs = ((tabsRes.Items as Tab[] | undefined) ?? [])
      .sort((a, b) => a.position - b.position)
      .map((t) => ({
        tab_id: t.tab_id,
        title: t.title,
        content: t.content,
        version: t.version,
        position: t.position,
      }));

    const access_log = await listAccess(memo.memo_id, 20);

    return noStore(
      ok({
        memo: { title: memo.title, updated_at: memo.updated_at },
        tabs,
        access_log,
      }),
    );
  } catch (err) {
    console.error('get-memo error:', err); // token/body はログに出さない
    return noStore(serverError());
  }
}
