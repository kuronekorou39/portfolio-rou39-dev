import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand, PutCommand, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/dynamo';
import { ok, created, badRequest, forbidden, serverError } from '../lib/response';
import { randomUUID } from 'crypto';

const TABLE = process.env.COMMENTS_TABLE!;

function getUserFromEvent(event: APIGatewayProxyEvent) {
  const claims = event.requestContext.authorizer?.claims;
  if (!claims) return null;
  return {
    userId: claims.sub as string,
    userName: (claims.nickname as string) || '匿名',
    userAvatar: (claims.picture as string) || '',
  };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const projectId = event.pathParameters?.projectId;
    const commentId = event.pathParameters?.commentId;
    const method = event.httpMethod;

    if (!projectId) return badRequest('projectId is required');

    // GET /comments/{projectId} — list comments
    if (method === 'GET') {
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: 'projectId = :pid',
          ExpressionAttributeValues: { ':pid': projectId },
          ScanIndexForward: false,
        })
      );
      return ok(result.Items ?? []);
    }

    // POST /comments/{projectId} — create comment (auth required)
    if (method === 'POST') {
      const user = getUserFromEvent(event);
      if (!user) return badRequest('Authentication required');

      const body = JSON.parse(event.body ?? '{}');
      const content = body.content?.trim();
      if (!content || content.length > 500) {
        return badRequest('Content is required (max 500 characters)');
      }

      const now = new Date().toISOString();
      const item = {
        id: randomUUID(),
        projectId,
        userId: user.userId,
        userName: user.userName,
        userAvatar: user.userAvatar,
        content,
        createdAt: now,
        updatedAt: now,
      };

      await docClient.send(new PutCommand({ TableName: TABLE, Item: item }));
      return created(item);
    }

    // DELETE /comments/{projectId}/{commentId} — delete own comment (auth required)
    if (method === 'DELETE' && commentId) {
      const user = getUserFromEvent(event);
      if (!user) return badRequest('Authentication required');

      const existing = await docClient.send(
        new GetCommand({ TableName: TABLE, Key: { projectId, id: commentId } })
      );
      if (!existing.Item) return badRequest('Comment not found');
      if (existing.Item.userId !== user.userId) return forbidden('Not your comment');

      await docClient.send(
        new DeleteCommand({ TableName: TABLE, Key: { projectId, id: commentId } })
      );
      return ok({ message: 'Deleted' });
    }

    return badRequest('Unsupported method');
  } catch (error) {
    console.error('Comments handler error:', error);
    return serverError();
  }
}
