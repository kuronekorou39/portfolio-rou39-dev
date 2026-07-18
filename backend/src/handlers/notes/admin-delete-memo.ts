import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ok, notFound, forbidden, serverError } from '../../lib/response';
import { deleteMemo } from '../../lib/notes/memos';

/**
 * DELETE /admin/memos/{memo_id} — メモの削除(トークン失効 → タブ全削除 →
 * soft-delete → 無料枠返却)。元に戻せない旨はフロントで確認済みの前提。
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userSub = event.requestContext.authorizer?.claims?.sub as string | undefined;
    if (!userSub) return forbidden('login_required');
    const memo_id = event.pathParameters?.memo_id;
    if (!memo_id) return notFound();

    const result = await deleteMemo({ memo_id, owner_user_id: userSub });
    if (!result.ok) return notFound();
    return ok({ memo_id, deleted: true });
  } catch (err) {
    console.error('admin-delete-memo error:', err);
    return serverError();
  }
}
