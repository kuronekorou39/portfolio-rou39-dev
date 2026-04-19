import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/dynamo';
import { badRequest, notFound, serverError } from '../lib/response';

const PROJECTS_TABLE = process.env.PROJECTS_TABLE!;
const PAGE_VIEWS_TABLE = process.env.PAGE_VIEWS_TABLE!;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const projectId = event.pathParameters?.projectId;
    if (!projectId) return badRequest('projectId is required');

    const os = event.queryStringParameters?.os;

    // Read project from DynamoDB
    const result = await docClient.send(
      new GetCommand({ TableName: PROJECTS_TABLE, Key: { id: projectId } })
    );

    if (!result.Item) return notFound('Project not found');

    const downloads = result.Item.downloads as { label: string; url: string; os: string }[] | undefined;
    if (!downloads || downloads.length === 0) return notFound('No downloads available');

    // Find matching download by OS, or fall back to first
    const entry = (os ? downloads.find(d => d.os === os) : null) || downloads[0];

    // Increment download count
    await docClient.send(
      new UpdateCommand({
        TableName: PAGE_VIEWS_TABLE,
        Key: { projectId },
        UpdateExpression: 'ADD downloadCount :inc',
        ExpressionAttributeValues: { ':inc': 1 },
      })
    );

    // 302 redirect to actual file
    return {
      statusCode: 302,
      headers: {
        Location: entry.url,
        'Cache-Control': 'no-cache',
      },
      body: '',
    };
  } catch (error) {
    console.error('Downloads handler error:', error);
    return serverError();
  }
}
