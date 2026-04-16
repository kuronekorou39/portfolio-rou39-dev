import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { randomUUID } from 'crypto';
import { docClient } from '../lib/dynamo';
import { ok, badRequest, serverError } from '../lib/response';

const TABLE = process.env.CONTACTS_TABLE!;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL!;
const FROM_EMAIL = process.env.FROM_EMAIL || NOTIFY_EMAIL;
const ses = new SESClient({});

const RATE_LIMIT_SECONDS = 600; // 10 minutes per IP
const MESSAGE_MAX_LENGTH = 5000;
const MIN_SUBMIT_TIME_MS = 3000; // 3 seconds minimum

const VALID_CATEGORIES = ['work', 'feedback', 'other'];

function getClientIp(event: APIGatewayProxyEvent): string {
  return (
    event.headers['X-Forwarded-For']?.split(',')[0]?.trim() ||
    event.requestContext.identity?.sourceIp ||
    'unknown'
  );
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (event.httpMethod !== 'POST') return badRequest('Unsupported method');

    const body = JSON.parse(event.body || '{}');
    const { name, email, category, message, _hp, _ts } = body;

    // Honeypot check — hidden field should be empty
    if (_hp) return ok({ success: true }); // fake success to fool bots

    // Time check — reject if submitted too fast
    if (typeof _ts === 'number' && Date.now() - _ts < MIN_SUBMIT_TIME_MS) {
      return ok({ success: true }); // fake success
    }

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 100)
      return badRequest('name_invalid');

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      return badRequest('email_invalid');

    if (!VALID_CATEGORIES.includes(category))
      return badRequest('category_invalid');

    if (!message || typeof message !== 'string' || message.trim().length === 0 || message.trim().length > MESSAGE_MAX_LENGTH)
      return badRequest('message_invalid');

    // Rate limit check by IP
    const ip = getClientIp(event);
    const now = Math.floor(Date.now() / 1000);

    const rateLimitKey = { pk: `RATE#${ip}`, sk: 'contact' };
    const rateCheck = await docClient.send(
      new GetCommand({ TableName: TABLE, Key: rateLimitKey })
    );

    if (rateCheck.Item && (now - (rateCheck.Item.lastSent as number)) < RATE_LIMIT_SECONDS) {
      return badRequest('rate_limited');
    }

    // Save inquiry
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    await docClient.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          pk: `INQUIRY#${id}`,
          sk: createdAt,
          name: name.trim(),
          email: email.trim(),
          category,
          message: message.trim(),
          ip,
          createdAt,
        },
      })
    );

    // Update rate limit
    await docClient.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          ...rateLimitKey,
          lastSent: now,
          ttl: now + RATE_LIMIT_SECONDS,
        },
      })
    );

    // Send email notification via SES
    const categoryLabel = category === 'work' ? '仕事の依頼' : category === 'feedback' ? 'フィードバック' : 'その他';
    try {
      await ses.send(
        new SendEmailCommand({
          Source: FROM_EMAIL,
          Destination: { ToAddresses: [NOTIFY_EMAIL] },
          Message: {
            Subject: { Data: `[rou39.com] ${categoryLabel}: ${name.trim()}` },
            Body: {
              Text: {
                Data: [
                  `種別: ${categoryLabel}`,
                  `名前: ${name.trim()}`,
                  `メール: ${email.trim()}`,
                  ``,
                  message.trim(),
                  ``,
                  `---`,
                  `IP: ${ip}`,
                  `日時: ${createdAt}`,
                ].join('\n'),
              },
            },
          },
        })
      );
    } catch (sesErr) {
      console.error('SES notification failed:', sesErr);
      // Don't fail the request — inquiry is already saved
    }

    return ok({ success: true });
  } catch (error) {
    console.error('Contact handler error:', error);
    return serverError();
  }
}
