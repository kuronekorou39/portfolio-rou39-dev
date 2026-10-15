import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../lib/dynamo';
import { ok, notFound, unauthorized, forbidden, tooManyRequests, serverError } from '../../lib/response';
import { noStore } from '../../lib/notes/http';
import { passesOriginCheck, prefetchOriginSecret } from '../../lib/notes/origin';
import { resolveToken, modeOf } from '../../lib/notes/tokens';
import { checkMemoPin } from '../../lib/notes/pin';
import { recordViewCoalesced, listAccess, prefetchIpHashKey } from '../../lib/notes/access-log';
import { PLAN_LIMITS } from '../../lib/notes/limits';
import type { Memo, Tab } from '../../lib/notes/types';

const MEMOS_TABLE = process.env.MEMOS_TABLE!;
const TABS_TABLE = process.env.TABS_TABLE!;

/** 同梱するアクセス履歴の件数(メモ画面の折りたたみパネル用)。 */
const ACCESS_LOG_ENTRIES = 20;

// このハンドラは notes で最も呼ばれる読み取りパス(画面表示中は30秒ごとのポーリングも来る)。
// 2つの秘密をハンドラ内で初めて触ると Secrets Manager への往復が直列で応答時間に乗るため、
// init フェーズで並列に先行取得しておく。
prefetchOriginSecret();
prefetchIpHashKey();

/**
 * 全タブを取得する。本文は読まれる行の大きさで課金されるので、ここは常にフル行を読む
 * (ProjectionExpression で絞っても読み取り量は減らない)。1MB/ページを超えても
 * 続きを辿る(プランによってはタブ数×60KB が 1MB を超える)。rev が進んだときだけ
 * 来る経路なので、タブ書き込み直後の古い読みを掴まないよう強整合で読む。
 */
async function queryAllTabs(memo_id: string): Promise<Tab[]> {
  const items: Tab[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABS_TABLE,
        KeyConditionExpression: 'memo_id = :m',
        ExpressionAttributeValues: { ':m': memo_id },
        ConsistentRead: true,
        ExclusiveStartKey,
      }),
    );
    items.push(...((res.Items as Tab[] | undefined) ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (ExclusiveStartKey);
  return items;
}

/**
 * POST /m/get — 秘密URLトークンでメモ本体+タブを取得(オーソライザー無し)。
 *
 * トークンは POST body でのみ受け取る(path/query に載せるとアクセスログや
 * ブラウザ履歴に残るため)。未知・失効・削除済みはすべて同一の 404 を返し、
 * トークンの有効性を探るオラクルにしない。生トークンや body はログに出さない。
 *
 * 通信量を抑えるための省略パラメータ(どちらも任意。省略時は従来どおり全タブ本文を返す):
 * - known_rev: クライアントが最後に取り込んだ変更カウンタ。メモの rev がこれ以下なら
 *   タブを読まず { unchanged: true } で返す(ポーリングの本命経路。応答は数KB)。
 * - tab_ids: 本文(content)を含めるタブの配列。要素は tab_id 文字列か { tab_id, version }。
 *   version 付きなら、サーバの version と同じタブは本文を省く(手元と同じ内容を送り直さない)。
 *   first_tab=true なら先頭タブも含める。どちらかを指定したら、それ以外のタブは
 *   title/version/position/byte_size のメタだけ返す(遅延読み込み)。両方省略なら全タブ本文。
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!(await passesOriginCheck(event))) return noStore(forbidden('forbidden'));
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return noStore(notFound());
    }
    const { token, pin, known_rev, tab_ids, first_tab } = body as {
      token?: unknown;
      pin?: unknown;
      known_rev?: unknown;
      tab_ids?: unknown;
      first_tab?: unknown;
    };
    if (typeof token !== 'string' || !token) return noStore(notFound());

    const resolved = await resolveToken(token);
    if (!resolved) return noStore(notFound());

    // rev の比較に使うので強整合で読む(結果整合だと自分の保存直後に古い rev を掴み得る)
    const memoRes = await docClient.send(
      new GetCommand({ TableName: MEMOS_TABLE, Key: { memo_id: resolved.memo_id }, ConsistentRead: true }),
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
    const rev = memo.rev ?? 0;
    const head = {
      // memo_id はクライアントがメモ単位のローカル状態(最後に見ていたタブ・既読IP)を
      // 保存するキーに使う。トークン保持者は既に全権限を持つので、これ自体は権限を増やさない。
      memo: { memo_id: memo.memo_id, title: memo.title, updated_at: memo.updated_at },
      mode,
      has_pin: !!memo.pin_hash, // クライアントは書き込み時に PIN を同送する必要があるか判断
      rev,
      tab_limit: memo.tab_limit ?? PLAN_LIMITS.free.tabs, // 旧メモ(刻印なし)は無料枠
    };

    // 閲覧を記録(トークン単位で10分coalesce・best-effort)。どのURL経由かも残す。
    // 「誰がいつ開いたか」を表示するのが、E2E暗号化しない代わりの受容策。
    const viewRecorded = recordViewCoalesced({
      token_hash: resolved.token_hash,
      memo_id: memo.memo_id,
      via: mode,
      event,
    });

    // 変更なし: タブを読まずに返す。アクセス履歴は編集用URL(rw)にだけ返す
    // (読み取り専用の共有相手に他の訪問者のIPを見せない)。
    if (typeof known_rev === 'number' && rev <= known_rev) {
      await viewRecorded;
      const access_log = mode === 'rw' ? await listAccess(memo.memo_id, ACCESS_LOG_ENTRIES) : [];
      return noStore(ok({ ...head, unchanged: true, access_log }));
    }

    // 本文を含めるタブの選択。両方省略なら全タブ(旧クライアント・オフライン保存との互換)
    // tab_id → クライアントが持つ version(不明なら null)
    const wantIds = Array.isArray(tab_ids) ? new Map<string, number | null>() : null;
    if (wantIds) {
      for (const x of tab_ids as unknown[]) {
        if (typeof x === 'string') wantIds.set(x, null);
        else if (x && typeof x === 'object' && typeof (x as { tab_id?: unknown }).tab_id === 'string') {
          const v = (x as { version?: unknown }).version;
          wantIds.set((x as { tab_id: string }).tab_id, typeof v === 'number' ? v : null);
        }
      }
    }
    const wantFirst = first_tab === true;
    const wantAll = wantIds === null && !wantFirst;

    // 閲覧記録とタブ取得は互いに依存しないので並列に走らせる(直列だと往復が積み上がる)。
    // 後段の listAccess だけは記録の完了後に置き、今回の閲覧が履歴に載る挙動を保つ。
    const [, items] = await Promise.all([viewRecorded, queryAllTabs(memo.memo_id)]);
    const tabs = items
      .sort((a, b) => a.position - b.position)
      .map((t, i) => {
        const known = wantIds?.get(t.tab_id); // undefined=要求外, null=version 不明, number=手元の version
        const withContent =
          wantAll || (wantFirst && i === 0) || (known !== undefined && known !== t.version);
        return {
          tab_id: t.tab_id,
          title: t.title,
          version: t.version,
          position: t.position,
          byte_size: typeof t.byte_size === 'number' ? t.byte_size : Buffer.byteLength(t.content, 'utf8'),
          ...(withContent ? { content: t.content } : {}),
        };
      });

    const access_log = mode === 'rw' ? await listAccess(memo.memo_id, ACCESS_LOG_ENTRIES) : [];
    return noStore(ok({ ...head, tabs, access_log }));
  } catch (err) {
    console.error('get-memo error:', err); // token/body はログに出さない
    return noStore(serverError());
  }
}
