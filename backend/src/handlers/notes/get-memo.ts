import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../lib/dynamo';
import { ok, notFound, unauthorized, forbidden, tooManyRequests, serverError } from '../../lib/response';
import { noStore } from '../../lib/notes/http';
import { passesOriginCheck, prefetchOriginSecret } from '../../lib/notes/origin';
import { resolveToken, modeOf } from '../../lib/notes/tokens';
import { checkMemoPin } from '../../lib/notes/pin';
import { recordViewCoalesced, listAccess, prefetchIpHashKey } from '../../lib/notes/access-log';
import type { Memo, Tab } from '../../lib/notes/types';

const MEMOS_TABLE = process.env.MEMOS_TABLE!;
const TABS_TABLE = process.env.TABS_TABLE!;

// このハンドラは notes で最も呼ばれる読み取りパス(画面表示中は30秒ごとのポーリングも来る)。
// 2つの秘密をハンドラ内で初めて触ると Secrets Manager への往復が直列で応答時間に乗るため、
// init フェーズで並列に先行取得しておく。
prefetchOriginSecret();
prefetchIpHashKey();

/**
 * POST /m/get — 秘密URLトークンでメモ本体+全タブを取得(オーソライザー無し)。
 *
 * トークンは POST body でのみ受け取る(path/query に載せるとアクセスログや
 * ブラウザ履歴に残るため)。未知・失効・削除済みはすべて同一の 404 を返し、
 * トークンの有効性を探るオラクルにしない。生トークンや body はログに出さない。
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!(await passesOriginCheck(event))) return noStore(forbidden('forbidden'));
    let token: unknown;
    try {
      token = JSON.parse(event.body || '{}').token;
    } catch {
      return noStore(notFound());
    }
    const pin = JSON.parse(event.body || '{}').pin;
    if (typeof token !== 'string' || !token) return noStore(notFound());

    const resolved = await resolveToken(token);
    if (!resolved) return noStore(notFound());

    const memoRes = await docClient.send(
      new GetCommand({ TableName: MEMOS_TABLE, Key: { memo_id: resolved.memo_id } }),
    );
    const memo = memoRes.Item as Memo | undefined;
    if (!memo || memo.status !== 'active') return noStore(notFound());

    // PIN ゲート(設定されている場合)。トークンは既に解決済みなので lock 状態はそこから使う。
    const pinRes = await checkMemoPin({
      memo_pin_hash: memo.pin_hash,
      token_hash: resolved.token_hash,
      tokenState: resolved,
      pin,
    });
    if (pinRes === 'locked') return noStore(tooManyRequests('pin_locked'));
    if (pinRes === 'required') return noStore(unauthorized('pin_required'));
    if (pinRes === 'incorrect') return noStore(unauthorized('pin_incorrect'));

    const mode = modeOf(resolved);

    // 閲覧記録とタブ取得は互いに依存しないので並列に走らせる(直列だと往復が積み上がる)。
    // 後段の listAccess だけは記録の完了後に置き、今回の閲覧が履歴に載る挙動を保つ。
    //
    // 閲覧を記録(トークン単位で10分coalesce・best-effort)。どのURL経由かも残す。
    // 「誰がいつ開いたか」を表示するのが、E2E暗号化しない代わりの受容策。
    //
    // 全タブ取得。MAX_TABS_PER_MEMO × TAB_CAP_BYTES ≤ 約1MB に制約しているため
    // Query 1ページに必ず収まる(limits.ts 参照)。
    const [, tabsRes] = await Promise.all([
      recordViewCoalesced({
        token_hash: resolved.token_hash,
        memo_id: memo.memo_id,
        via: mode,
        event,
      }),
      docClient.send(
        new QueryCommand({
          TableName: TABS_TABLE,
          KeyConditionExpression: 'memo_id = :m',
          ExpressionAttributeValues: { ':m': resolved.memo_id },
        }),
      ),
    ]);
    const tabs = ((tabsRes.Items as Tab[] | undefined) ?? [])
      .sort((a, b) => a.position - b.position)
      .map((t) => ({
        tab_id: t.tab_id,
        title: t.title,
        content: t.content,
        version: t.version,
        position: t.position,
      }));

    // アクセス履歴は編集用URL(rw)にだけ返す。読み取り専用の共有相手には
    // 他の訪問者のIPを見せない(「より制限された共有はより少なく見える」原則)。
    const access_log = mode === 'rw' ? await listAccess(memo.memo_id, 20) : [];

    return noStore(
      ok({
        // memo_id はクライアントがメモ単位のローカル状態(最後に見ていたタブ・既読IP)を
        // 保存するキーに使う。トークン保持者は既に全権限を持つので、これ自体は権限を増やさない。
        memo: { memo_id: memo.memo_id, title: memo.title, updated_at: memo.updated_at },
        mode,
        has_pin: !!memo.pin_hash, // クライアントは書き込み時に PIN を同送する必要があるか判断
        tabs,
        access_log,
      }),
    );
  } catch (err) {
    console.error('get-memo error:', err); // token/body はログに出さない
    return noStore(serverError());
  }
}
