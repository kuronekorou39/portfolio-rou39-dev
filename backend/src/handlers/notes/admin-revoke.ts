import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ok, notFound, forbidden, serverError } from '../../lib/response';
import { revokeToken } from '../../lib/notes/tokens';

/**
 * POST /admin/memos/{memo_id}/revoke — 秘密URLの失効(代替は発行しない)。
 * 再び使えるようにするには「再発行」を行う。冪等。
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userSub = event.requestContext.authorizer?.claims?.sub as string | undefined;
    if (!userSub) return forbidden('login_required');
    const memo_id = event.pathParameters?.memo_id;
    if (!memo_id) return notFound();

    const result = await revokeToken({ memo_id, owner_user_id: userSub });
    if (!result.ok) return notFound();
    return ok({ memo_id, revoked: true });
  } catch (err) {
    console.error('admin-revoke error:', err);
    return serverError();
  }
}
