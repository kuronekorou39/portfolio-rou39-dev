import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/dynamo';
import { ok, badRequest, serverError } from '../lib/response';

const TABLE = process.env.INTERESTS_TABLE!;

function getUserId(event: APIGatewayProxyEvent): string | null {
  return (event.requestContext.authorizer?.claims?.sub as string) ?? null;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const projectId = event.pathParameters?.projectId;
    if (!projectId) return badRequest('projectId is required');

    const method = event.httpMethod;

    // GET /interests/{projectId} — get count + whether current user is interested
    if (method === 'GET') {
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: 'projectId = :pid',
          ExpressionAttributeValues: { ':pid': projectId },
        })
      );
      const items = result.Items ?? [];
      // Check if current user (from optional auth) is in the list
      const userId = event.requestContext.authorizer?.claims?.sub as string | undefined;
      return ok({
        projectId,
        count: items.length,
        interested: userId ? items.some((i) => i.userId === userId) : false,
      });
    }

    // POST /interests/{projectId} — add interest (auth required)
    if (method === 'POST') {
      const userId = getUserId(event);
      if (!userId) return badRequest('Authentication required');

      await docClient.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            projectId,
            userId,
            createdAt: new Date().toISOString(),
          },
          ConditionExpression: 'attribute_not_exists(userId)',
        })
      );
      return ok({ message: 'Interest added' });
    }

    // DELETE /interests/{projectId} — remove interest (auth required)
    if (method === 'DELETE') {
      const userId = getUserId(event);
      if (!userId) return badRequest('Authentication required');

      await docClient.send(
        new DeleteCommand({
          TableName: TABLE,
          Key: { projectId, userId },
        })
      );
      return ok({ message: 'Interest removed' });
    }

    return badRequest('Unsupported method');
  } catch (error: unknown) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      return ok({ message: 'Already interested' });
    }
    console.error('Interests handler error:', error);
    return serverError();
  }
}
