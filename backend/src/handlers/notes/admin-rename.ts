import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ok, badRequest, notFound, forbidden, serverError } from '../../lib/response';
import { renameMemo } from '../../lib/notes/memos';

/** PATCH /admin/memos/{memo_id} — メモの管理用タイトル変更。 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userSub = event.requestContext.authorizer?.claims?.sub as string | undefined;
    if (!userSub) return forbidden('login_required');
    const memo_id = event.pathParameters?.memo_id;
    if (!memo_id) return notFound();

    const body = JSON.parse(event.body || '{}');
    const title = typeof body.title === 'string' ? body.title.trim() : null;
    if (title === null) return badRequest('title_required');
    if (title.length > 200) return badRequest('title_too_long');

    const result = await renameMemo({ memo_id, owner_user_id: userSub, title });
    if (!result.ok) return notFound();
    return ok({ memo_id, title });
  } catch (err) {
    console.error('admin-rename error:', err);
    return serverError();
  }
}
