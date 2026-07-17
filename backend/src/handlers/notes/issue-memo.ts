import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { created, badRequest, forbidden, conflict, serverError } from '../../lib/response';
import { issueMemo } from '../../lib/notes/tokens';

const SITE_BASE_URL = process.env.NOTES_SITE_URL!; // https://notes.rou39.com

/**
 * POST /admin/memos — メモURL の新規発行(Cognito オーソライザー必須)。
 *
 * レスポンスの url に生トークン(フラグメント)が含まれるのはこの1回だけ。
 * サーバ側にはハッシュしか残らないため再表示はできない(フロントはその旨を明示する)。
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userSub = event.requestContext.authorizer?.claims?.sub as string | undefined;
    if (!userSub) return forbidden('login_required');

    const body = JSON.parse(event.body || '{}');
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (title.length > 200) return badRequest('title_too_long');

    const result = await issueMemo({ owner_user_id: userSub, title });
    if (!result.ok) return conflict('memo_limit_reached');

    return created({
      memo_id: result.memo_id,
      // トークンはフラグメント(#)に載せる。フラグメントはサーバ・Referer・
      // アクセスログのいずれにも送信されない。
      url: `${SITE_BASE_URL}/m#${result.rawToken}`,
    });
  } catch (err) {
    console.error('issue-memo error:', err);
    return serverError();
  }
}
