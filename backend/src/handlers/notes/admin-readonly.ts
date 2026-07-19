import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ok, notFound, forbidden, conflict, serverError } from '../../lib/response';
import { reissueToken } from '../../lib/notes/tokens';

const SITE_BASE_URL = process.env.NOTES_SITE_URL!;

/**
 * POST /admin/memos/{memo_id}/readonly — 読み取り専用URLの発行/再発行(Cognito 必須)。
 *
 * 読み取り専用スロットは最初空なので「発行」も「再発行」もこの1操作で兼ねる。
 * 既に読み取り専用URLがあれば旧URLはこの瞬間から無効になる。編集用URLには影響しない。
 * 生トークンはこのレスポンスの1回だけ返す。
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userSub = event.requestContext.authorizer?.claims?.sub as string | undefined;
    if (!userSub) return forbidden('login_required');
    const memo_id = event.pathParameters?.memo_id;
    if (!memo_id) return notFound();

    const result = await reissueToken({ memo_id, owner_user_id: userSub, mode: 'ro' });
    if (!result.ok) {
      return result.reason === 'conflict' ? conflict('reissue_conflict') : notFound();
    }
    return ok({ memo_id, url: `${SITE_BASE_URL}/m#${result.rawToken}` });
  } catch (err) {
    console.error('admin-readonly error:', err);
    return serverError();
  }
}
