import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/dynamo';
import { ok, badRequest, serverError } from '../lib/response';

const TABLE = process.env.PAGE_VIEWS_TABLE!;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const projectId = event.pathParameters?.projectId;
    if (!projectId) return badRequest('projectId is required');

    // POST /page-views/{projectId} — increment view count
    if (event.httpMethod === 'POST') {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { projectId },
          UpdateExpression: 'ADD #count :inc',
          ExpressionAttributeNames: { '#count': 'count' },
          ExpressionAttributeValues: { ':inc': 1 },
        })
      );
      return ok({ message: 'Counted' });
    }

    // GET /page-views/{projectId} — get view count
    if (event.httpMethod === 'GET') {
      const result = await docClient.send(
        new GetCommand({ TableName: TABLE, Key: { projectId } })
      );
      return ok({
        projectId,
        count: result.Item?.count ?? 0,
        downloadCount: result.Item?.downloadCount ?? 0,
      });
    }

    return badRequest('Unsupported method');
  } catch (error) {
    console.error('PageViews handler error:', error);
    return serverError();
  }
}
