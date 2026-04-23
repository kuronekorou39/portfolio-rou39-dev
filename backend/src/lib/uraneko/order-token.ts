import { createHmac, timingSafeEqual } from 'crypto';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const SECRET_NAME = process.env.ORDER_ACCESS_SECRET_SECRET!;
const sm = new SecretsManagerClient({});
let cached: string | null = null;

async function getSecret(): Promise<string> {
  if (cached) return cached;
  const res = await sm.send(new GetSecretValueCommand({ SecretId: SECRET_NAME }));
  if (!res.SecretString) throw new Error(`Secret ${SECRET_NAME} has no SecretString`);
  const value: string = res.SecretString;
  cached = value;
  return value;
}

/**
 * ゲスト購入者がメール経由で注文にアクセスするためのトークン。
 * Cognito 認証が使えないので、order_id を HMAC で署名した短いトークンをメールに埋め込む。
 *
 * 形式: "<order_id>.<hmac_hex_first_32>"
 */
export async function signOrderToken(orderId: string): Promise<string> {
  const secret = await getSecret();
  const mac = createHmac('sha256', secret).update(orderId).digest('hex').slice(0, 32);
  return `${orderId}.${mac}`;
}

export async function verifyOrderToken(token: string): Promise<string | null> {
  const dot = token.lastIndexOf('.');
  if (dot === -1) return null;
  const orderId = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const secret = await getSecret();
  const expected = createHmac('sha256', secret).update(orderId).digest('hex').slice(0, 32);
  if (mac.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'))) return null;
  } catch {
    return null;
  }
  return orderId;
}
