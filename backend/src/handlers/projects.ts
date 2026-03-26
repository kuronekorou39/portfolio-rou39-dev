import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/dynamo';
import { ok, notFound, serverError } from '../lib/response';

const TABLE = process.env.PROJECTS_TABLE!;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const projectId = event.pathParameters?.id;

    if (projectId) {
      // GET /projects/{id}
      const result = await docClient.send(
        new GetCommand({ TableName: TABLE, Key: { id: projectId } })
      );
      if (!result.Item) return notFound('Project not found');
      return ok(result.Item);
    }

    // GET /projects
    const result = await docClient.send(new ScanCommand({ TableName: TABLE }));
    return ok(result.Items ?? []);
  } catch (error) {
    console.error('Projects handler error:', error);
    return serverError();
  }
}
