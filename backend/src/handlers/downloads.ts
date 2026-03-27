import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { docClient } from '../lib/dynamo';
import { ok, badRequest, notFound, serverError } from '../lib/response';

const TABLE = process.env.PROJECTS_TABLE!;
const BUCKET = process.env.ASSETS_BUCKET!;

const s3 = new S3Client({});

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const projectId = event.pathParameters?.projectId;
    if (!projectId) {
      return badRequest('projectId is required');
    }

    // DynamoDB からプロジェクト情報を取得
    const result = await docClient.send(
      new GetCommand({ TableName: TABLE, Key: { id: projectId } })
    );

    if (!result.Item) {
      return notFound('Project not found');
    }

    // ダウンロードリンクが存在するか確認
    if (!result.Item.links?.download) {
      return notFound('No download available for this project');
    }

    // S3 署名付きURLを生成 (有効期限: 5分)
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: `downloads/${projectId}/${projectId}.zip`,
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 300 });

    return ok({ url });
  } catch (error) {
    console.error('Downloads handler error:', error);
    return serverError();
  }
}
