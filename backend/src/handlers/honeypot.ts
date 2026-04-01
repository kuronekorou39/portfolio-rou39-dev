import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/dynamo';
import { ok, badRequest, serverError } from '../lib/response';
import { randomUUID } from 'crypto';

const TABLE = process.env.HONEYPOT_TABLE!;

// Credentials that "work"
const VALID_CREDS = [
  { user: 'admin', pass: 'admin' },
  { user: 'admin', pass: 'password' },
  { user: 'admin', pass: '1234' },
  { user: 'root', pass: 'root' },
  { user: 'root', pass: 'password' },
  { user: 'administrator', pass: 'admin' },
];

// SQLi patterns that "work"
const SQLI_PATTERNS = [
  /'\s*or\s+.+=.+/i,         // ' OR 1=1
  /'\s*or\s+'.*'='.*'/i,     // ' OR ''='
  /'\s*;\s*--/i,             // '; --
  /admin'\s*--/i,            // admin'--
  /'\s*or\s+1\s*=\s*1/i,    // ' or 1=1
  /"\s*or\s+".*"=".*"/i,    // " OR ""="
  /'\s*or\s+true/i,          // ' or true
];

function checkLogin(username: string, password: string): { success: boolean; method: string } {
  // Check SQLi in either field
  for (const pattern of SQLI_PATTERNS) {
    if (pattern.test(username) || pattern.test(password)) {
      return { success: true, method: 'sqli' };
    }
  }

  // Check known credentials
  const normalized = { user: username.toLowerCase().trim(), pass: password };
  for (const cred of VALID_CREDS) {
    if (normalized.user === cred.user && normalized.pass === cred.pass) {
      return { success: true, method: 'default-creds' };
    }
  }

  return { success: false, method: 'none' };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (event.httpMethod !== 'POST') return badRequest('POST only');

    const body = JSON.parse(event.body ?? '{}');
    const type: string = body.type; // 'visit' | 'login-attempt' | 'action'

    if (!type) return badRequest('type is required');

    const ip = event.requestContext.identity?.sourceIp ?? 'unknown';
    const userAgent = event.headers?.['User-Agent'] ?? event.headers?.['user-agent'] ?? 'unknown';
    const now = new Date().toISOString();

    // Sanitize all string inputs (strip HTML tags to prevent stored XSS in logs)
    const sanitize = (s: unknown): string =>
      typeof s === 'string' ? s.replace(/<[^>]*>/g, '').slice(0, 1000) : String(s ?? '');

    const baseItem = {
      pk: `SESSION#${sanitize(body.sessionId) || 'anonymous'}`,
      sk: `${now}#${randomUUID().slice(0, 8)}`,
      type: sanitize(type),
      ip,
      userAgent: userAgent.slice(0, 500),
      timestamp: now,
      ttl: Math.floor(Date.now() / 1000) + 90 * 86400, // 90 days TTL
    };

    if (type === 'visit') {
      await docClient.send(new PutCommand({
        TableName: TABLE,
        Item: { ...baseItem, page: sanitize(body.page) },
      }));
      return ok({ logged: true });
    }

    if (type === 'login-attempt') {
      const username = sanitize(body.username);
      const password = sanitize(body.password);
      const result = checkLogin(body.username ?? '', body.password ?? '');

      await docClient.send(new PutCommand({
        TableName: TABLE,
        Item: {
          ...baseItem,
          username,
          password,
          success: result.success,
          method: result.method,
        },
      }));

      // Return login result (the frontend decides what to show)
      return ok({
        success: result.success,
        method: result.method,
        token: result.success ? `fake-admin-${randomUUID()}` : null,
      });
    }

    if (type === 'action') {
      await docClient.send(new PutCommand({
        TableName: TABLE,
        Item: {
          ...baseItem,
          action: sanitize(body.action),
          detail: sanitize(body.detail),
        },
      }));
      return ok({ logged: true });
    }

    return badRequest('Unknown type');
  } catch (error) {
    console.error('Honeypot handler error:', error);
    return serverError();
  }
}
