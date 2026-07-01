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

const TOKEN_TTL_SEC = 60 * 60 * 24 * 30; // 30日でメールリンクは失効

/**
 * ゲスト購入者がメール経由で注文にアクセスするためのトークン。
 * Cognito 認証が使えないので、order_id + 有効期限を HMAC で署名してメールに埋め込む。
 * URL 漏洩時の無期限アクセスを防ぐため exp を含める(ログインユーザーは購入履歴から取得可)。
 *
 * 形式: "<order_id>.<exp_unix_sec>.<hmac_hex_first_32>"
 */
export async function signOrderToken(orderId: string): Promise<string> {
  const secret = await getSecret();
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
  const payload = `${orderId}.${exp}`;
  const mac = createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
  return `${payload}.${mac}`;
}

export async function verifyOrderToken(token: string): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [orderId, expStr, mac] = parts;
  const secret = await getSecret();
  const expected = createHmac('sha256', secret).update(`${orderId}.${expStr}`).digest('hex').slice(0, 32);
  if (mac.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'))) return null;
  } catch {
    return null;
  }
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null; // 期限切れ
  return orderId;
}
