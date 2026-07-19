import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ok, notFound, forbidden, conflict, serverError } from '../../lib/response';
import { revokeToken } from '../../lib/notes/tokens';

/**
 * POST /admin/memos/{memo_id}/readonly/revoke — 読み取り専用URLの失効(冪等)。
 * 編集用URLには影響しない。
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userSub = event.requestContext.authorizer?.claims?.sub as string | undefined;
    if (!userSub) return forbidden('login_required');
    const memo_id = event.pathParameters?.memo_id;
    if (!memo_id) return notFound();

    const result = await revokeToken({ memo_id, owner_user_id: userSub, mode: 'ro' });
    if (!result.ok) return result.reason === 'conflict' ? conflict('revoke_conflict') : notFound();
    return ok({ memo_id, revoked: true });
  } catch (err) {
    console.error('admin-readonly-revoke error:', err);
    return serverError();
  }
}
