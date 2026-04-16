import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { randomBytes } from 'crypto';
import { docClient } from '../lib/dynamo';
import { ok, created, badRequest, notFound, serverError } from '../lib/response';

const TABLE = process.env.CLIPS_TABLE!;
const MAX_BYTES = 300 * 1024; // 300KB
const TTL_SECONDS = 30 * 60; // 30 minutes
const MAX_RETRIES = 3;

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateCode(): string {
  const bytes = randomBytes(10);
  return Array.from(bytes).map(b => CHARS[b % CHARS.length]).join('');
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // POST /clip — save text, return code
    if (event.httpMethod === 'POST') {
      const { text } = JSON.parse(event.body || '{}');

      if (!text) return badRequest('text_required');
      if (Buffer.byteLength(text, 'utf-8') > MAX_BYTES) return badRequest('text_too_large');

      const now = Math.floor(Date.now() / 1000);

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const code = generateCode();
        try {
          await docClient.send(
            new PutCommand({
              TableName: TABLE,
              Item: {
                code,
                text,
                createdAt: now,
                ttl: now + TTL_SECONDS,
              },
              ConditionExpression: 'attribute_not_exists(code)',
            })
          );
          return created({ code });
        } catch (e) {
          if (e instanceof ConditionalCheckFailedException) continue;
          throw e;
        }
      }

      return serverError('Failed to generate unique code');
    }

    // GET /clip/{code} — retrieve text
    if (event.httpMethod === 'GET') {
      const code = event.pathParameters?.code;
      if (!code) return badRequest('code is required');

      const result = await docClient.send(
        new GetCommand({ TableName: TABLE, Key: { code } })
      );

      if (!result.Item) return notFound('not_found');

      return ok({
        text: result.Item.text,
        createdAt: result.Item.createdAt,
      });
    }

    return badRequest('Unsupported method');
  } catch (error) {
    console.error('Clip handler error:', error);
    return serverError();
  }
}
