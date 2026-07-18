import { createHmac, randomUUID } from 'crypto';
import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { docClient } from '../dynamo';
import { ACCESS_LOG_COALESCE_MS, ACCESS_LOG_RETENTION_DAYS } from './limits';
import type { AccessLogEntry } from './types';

const TOKENS_TABLE = process.env.TOKENS_TABLE!;
const ACCESS_LOGS_TABLE = process.env.ACCESS_LOGS_TABLE!;
const IP_HASH_SECRET_NAME = process.env.IP_HASH_SECRET!;

const sm = new SecretsManagerClient({});
let cachedBaseKey: string | null = null;

async function getBaseKey(): Promise<string> {
  if (cachedBaseKey) return cachedBaseKey;
  const res = await sm.send(new GetSecretValueCommand({ SecretId: IP_HASH_SECRET_NAME }));
  if (!res.SecretString) throw new Error('ip-hash secret has no value');
  cachedBaseKey = res.SecretString;
  return cachedBaseKey;
}

/**
 * IP の秘匿ハッシュ。素の SHA-256(ip) は IPv4 の 2^32 空間を総当たりできるため、
 * 鍵付き + 日次ローテートにする:
 *   dailySalt = HMAC(baseKey, 'YYYY-MM-DD') ; ip_hash = HMAC(dailySalt, ip) の先頭16hex
 * 日をまたぐと同一IPでも別ハッシュになる(過去ログの逆引き照合不能)。
 * 同日内は同じ値になるので「同じ相手が何度も見ている」ことだけは分かる。
 */
async function hashIp(ip: string): Promise<string> {
  const baseKey = await getBaseKey();
  const day = new Date().toISOString().slice(0, 10);
  const dailySalt = createHmac('sha256', baseKey).update(day).digest();
  return createHmac('sha256', dailySalt).update(ip).digest('hex').slice(0, 16);
}

/**
 * クライアント IP の抽出。CloudFront → エッジ最適化 API Gateway の二重CDN構成では
 * X-Forwarded-For の「末尾から2番目」が実クライアント(先頭はクライアント自身が
 * 偽装可能。本家 contact のレート制限で実証済みの取り方)。
 */
function clientIpOf(event: APIGatewayProxyEvent): string {
  const xff = event.headers?.['X-Forwarded-For'] ?? event.headers?.['x-forwarded-for'] ?? '';
  const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2];
  if (parts.length === 1) return parts[0];
  return event.requestContext?.identity?.sourceIp ?? 'unknown';
}

/**
 * 閲覧アクセスを記録する(トークン単位で coalesce)。
 *
 * 未スロットルの読み取りパスから呼ばれるため、まずトークンアイテムの
 * last_view_log_ms を条件付きで進め、窓(10分)内の再訪はログを書かない
 * (条件不成立 = 記録済み)。これで連打による書き込みアンプを構造的に防ぐ。
 * ログは本人向けの安心材料なので、失敗してもメモ表示は止めない(best-effort)。
 */
export async function recordViewCoalesced(params: {
  token_hash: string;
  memo_id: string;
  event: APIGatewayProxyEvent;
}): Promise<void> {
  const now = Date.now();
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TOKENS_TABLE,
        Key: { token_hash: params.token_hash },
        ConditionExpression:
          'attribute_exists(token_hash) AND (attribute_not_exists(last_view_log_ms) OR last_view_log_ms <= :threshold)',
        UpdateExpression: 'SET last_view_log_ms = :now',
        ExpressionAttributeValues: {
          ':threshold': now - ACCESS_LOG_COALESCE_MS,
          ':now': now,
        },
      }),
    );
  } catch (err: unknown) {
    // 窓内の再訪(ConditionalCheckFailed)は記録済み扱いで正常
    if ((err as { name?: string })?.name === 'ConditionalCheckFailedException') return;
    console.error('recordViewCoalesced throttle-mark failed (non-fatal):', (err as Error)?.name);
    return;
  }

  try {
    const ts = new Date(now).toISOString();
    const ip = clientIpOf(params.event);
    const entry: AccessLogEntry = {
      memo_id: params.memo_id,
      ts_ulid: `${ts}#${randomUUID().slice(0, 8)}`,
      token_hash: params.token_hash,
      ip,
      ip_hash: await hashIp(ip),
      ua: (params.event.headers?.['User-Agent'] ?? params.event.headers?.['user-agent'] ?? '').slice(0, 256),
      event: 'view',
      ts,
      expires_at: Math.floor(now / 1000) + ACCESS_LOG_RETENTION_DAYS * 24 * 60 * 60,
    };
    await docClient.send(new PutCommand({ TableName: ACCESS_LOGS_TABLE, Item: entry }));
  } catch (err) {
    console.error('recordViewCoalesced put failed (non-fatal):', (err as Error)?.name);
  }
}

/** 直近のアクセス記録を新しい順に返す(メモ画面/管理画面の表示用)。 */
export async function listAccess(memo_id: string, limit: number): Promise<
  Pick<AccessLogEntry, 'ts' | 'ip' | 'ip_hash' | 'ua'>[]
> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: ACCESS_LOGS_TABLE,
      KeyConditionExpression: 'memo_id = :m',
      ExpressionAttributeValues: { ':m': memo_id },
      ScanIndexForward: false, // 新しい順
      Limit: limit,
    }),
  );
  return ((res.Items as AccessLogEntry[] | undefined) ?? []).map((e) => ({
    ts: e.ts,
    ip: e.ip ?? '', // IP保存前の旧エントリは空(フロントは ip_hash にフォールバック)
    ip_hash: e.ip_hash,
    ua: e.ua,
  }));
}
