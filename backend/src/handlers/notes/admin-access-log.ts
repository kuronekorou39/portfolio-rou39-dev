import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ok, notFound, forbidden, serverError } from '../../lib/response';
import { getOwnedMemo } from '../../lib/notes/tokens';
import { listAccess } from '../../lib/notes/access-log';

/** GET /admin/memos/{memo_id}/access-log — アクセス履歴(所有者のみ・新しい順)。 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userSub = event.requestContext.authorizer?.claims?.sub as string | undefined;
    if (!userSub) return forbidden('login_required');
    const memo_id = event.pathParameters?.memo_id;
    if (!memo_id) return notFound();

    const memo = await getOwnedMemo(memo_id, userSub);
    if (!memo) return notFound();

    return ok({ entries: await listAccess(memo_id, 50) });
  } catch (err) {
    console.error('admin-access-log error:', err);
    return serverError();
  }
}
