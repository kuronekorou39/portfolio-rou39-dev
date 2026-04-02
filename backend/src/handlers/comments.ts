import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand, PutCommand, DeleteCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/dynamo';
import { ok, created, badRequest, notFound, forbidden, serverError } from '../lib/response';
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
    const resource = event.resource;

    if (!projectId) return badRequest('projectId is required');

    // Detect if this is a replies endpoint
    const isRepliesRoute = resource?.includes('/replies');

    // GET /comments/{projectId} — list main comments (no parentId)
    if (method === 'GET' && !isRepliesRoute) {
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: 'projectId = :pid',
          FilterExpression: 'attribute_not_exists(parentId)',
          ExpressionAttributeValues: { ':pid': projectId },
          ScanIndexForward: false,
        })
      );
      return ok(result.Items ?? []);
    }

    // GET /comments/{projectId}/{commentId}/replies — list replies for a comment
    if (method === 'GET' && isRepliesRoute && commentId) {
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: 'projectId = :pid',
          FilterExpression: 'parentId = :cid',
          ExpressionAttributeValues: {
            ':pid': projectId,
            ':cid': commentId,
          },
          ScanIndexForward: true,
        })
      );
      return ok(result.Items ?? []);
    }

    // POST /comments/{projectId} — create main comment (auth required)
    if (method === 'POST' && !isRepliesRoute) {
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
        replyCount: 0,
      };

      await docClient.send(new PutCommand({ TableName: TABLE, Item: item }));
      return created(item);
    }

    // POST /comments/{projectId}/{commentId}/replies — create reply (auth required)
    if (method === 'POST' && isRepliesRoute && commentId) {
      const user = getUserFromEvent(event);
      if (!user) return badRequest('Authentication required');

      // Verify parent comment exists
      const parent = await docClient.send(
        new GetCommand({ TableName: TABLE, Key: { projectId, id: commentId } })
      );
      if (!parent.Item) return notFound('Parent comment not found');

      const body = JSON.parse(event.body ?? '{}');
      const content = body.content?.trim();
      if (!content || content.length > 500) {
        return badRequest('Content is required (max 500 characters)');
      }

      const now = new Date().toISOString();
      const replyItem = {
        id: randomUUID(),
        projectId,
        parentId: commentId,
        userId: user.userId,
        userName: user.userName,
        userAvatar: user.userAvatar,
        content,
        createdAt: now,
      };

      // Save reply
      await docClient.send(new PutCommand({ TableName: TABLE, Item: replyItem }));

      // Increment replyCount on parent
      await docClient.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { projectId, id: commentId },
          UpdateExpression: 'SET replyCount = if_not_exists(replyCount, :zero) + :one',
          ExpressionAttributeValues: { ':zero': 0, ':one': 1 },
        })
      );

      return created(replyItem);
    }

    // DELETE /comments/{projectId}/{commentId} — delete own comment (auth required)
    if (method === 'DELETE' && commentId) {
      const user = getUserFromEvent(event);
      if (!user) return badRequest('Authentication required');

      const existing = await docClient.send(
        new GetCommand({ TableName: TABLE, Key: { projectId, id: commentId } })
      );
      if (!existing.Item) return notFound('Comment not found');
      if (existing.Item.userId !== user.userId) return forbidden('Not your comment');

      await docClient.send(
        new DeleteCommand({ TableName: TABLE, Key: { projectId, id: commentId } })
      );

      // If this was a reply, decrement parent's replyCount
      if (existing.Item.parentId) {
        await docClient.send(
          new UpdateCommand({
            TableName: TABLE,
            Key: { projectId, id: existing.Item.parentId },
            UpdateExpression: 'SET replyCount = if_not_exists(replyCount, :one) - :one',
            ExpressionAttributeValues: { ':one': 1 },
            ConditionExpression: 'attribute_exists(projectId)',
          })
        ).catch(() => {
          // Parent may already be deleted; ignore
        });
      }

      return ok({ message: 'Deleted' });
    }

    return badRequest('Unsupported method');
  } catch (error) {
    console.error('Comments handler error:', error);
    return serverError();
  }
}
