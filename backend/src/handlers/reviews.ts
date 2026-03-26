import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/dynamo';
import { ok, created, badRequest, forbidden, serverError } from '../lib/response';
import { randomUUID } from 'crypto';

const TABLE = process.env.REVIEWS_TABLE!;

function getUserFromEvent(event: APIGatewayProxyEvent) {
  const claims = event.requestContext.authorizer?.claims;
  if (!claims) return null;
  return {
    userId: claims.sub as string,
    userName: (claims.email as string) || 'Anonymous',
  };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const projectId = event.pathParameters?.projectId;
    const reviewId = event.pathParameters?.reviewId;
    const method = event.httpMethod;

    if (!projectId) return badRequest('projectId is required');

    // GET /reviews/{projectId} — list reviews
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

    // POST /reviews/{projectId} — create review
    if (method === 'POST') {
      const user = getUserFromEvent(event);
      if (!user) return forbidden('Authentication required');

      const body = JSON.parse(event.body || '{}');
      if (!body.content || body.rating == null) {
        return badRequest('content and rating are required');
      }
      if (body.rating < 0 || body.rating > 5) {
        return badRequest('rating must be between 0 and 5');
      }

      const now = new Date().toISOString();
      const review = {
        id: randomUUID(),
        projectId,
        userId: user.userId,
        userName: user.userName,
        rating: Number(body.rating),
        content: String(body.content),
        createdAt: now,
        updatedAt: now,
      };

      await docClient.send(new PutCommand({ TableName: TABLE, Item: review }));
      return created(review);
    }

    // PUT /reviews/{projectId}/{reviewId} — update review
    if (method === 'PUT' && reviewId) {
      const user = getUserFromEvent(event);
      if (!user) return forbidden('Authentication required');

      const body = JSON.parse(event.body || '{}');
      if (!body.content || body.rating == null) {
        return badRequest('content and rating are required');
      }

      await docClient.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { projectId, id: reviewId },
          UpdateExpression: 'SET content = :c, rating = :r, updatedAt = :u',
          ConditionExpression: 'userId = :uid',
          ExpressionAttributeValues: {
            ':c': String(body.content),
            ':r': Number(body.rating),
            ':u': new Date().toISOString(),
            ':uid': user.userId,
          },
        })
      );
      return ok({ message: 'Updated' });
    }

    // DELETE /reviews/{projectId}/{reviewId} — delete review
    if (method === 'DELETE' && reviewId) {
      const user = getUserFromEvent(event);
      if (!user) return forbidden('Authentication required');

      await docClient.send(
        new DeleteCommand({
          TableName: TABLE,
          Key: { projectId, id: reviewId },
          ConditionExpression: 'userId = :uid',
          ExpressionAttributeValues: { ':uid': user.userId },
        })
      );
      return ok({ message: 'Deleted' });
    }

    return badRequest('Unsupported method');
  } catch (error) {
    console.error('Reviews handler error:', error);
    return serverError();
  }
}
