import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ok, notFound, forbidden, conflict, serverError } from '../../lib/response';
import { reissueToken } from '../../lib/notes/tokens';

const SITE_BASE_URL = process.env.NOTES_SITE_URL!;

/**
 * POST /admin/memos/{memo_id}/reissue — 秘密URLの再発行(Cognito オーソライザー必須)。
 * 旧URLはコミットの瞬間から無効。新URLの生トークンはこのレスポンスの1回だけ。
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userSub = event.requestContext.authorizer?.claims?.sub as string | undefined;
    if (!userSub) return forbidden('login_required');
    const memo_id = event.pathParameters?.memo_id;
    if (!memo_id) return notFound();

    const result = await reissueToken({ memo_id, owner_user_id: userSub });
    if (!result.ok) {
      return result.reason === 'conflict' ? conflict('reissue_conflict') : notFound();
    }
    return ok({ memo_id, url: `${SITE_BASE_URL}/m#${result.rawToken}` });
  } catch (err) {
    console.error('admin-reissue error:', err);
    return serverError();
  }
}
