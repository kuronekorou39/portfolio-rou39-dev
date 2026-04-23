import { createHmac } from 'crypto';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const BASE_URL = process.env.NOWPAYMENTS_BASE_URL || 'https://api.nowpayments.io/v1';
const API_KEY_SECRET_NAME = process.env.NOWPAYMENTS_API_KEY_SECRET!;
const IPN_SECRET_SECRET_NAME = process.env.NOWPAYMENTS_IPN_SECRET_SECRET!;

const sm = new SecretsManagerClient({});

let cachedApiKey: string | null = null;
let cachedIpnSecret: string | null = null;

async function getSecret(name: string): Promise<string> {
  const res = await sm.send(new GetSecretValueCommand({ SecretId: name }));
  if (!res.SecretString) throw new Error(`Secret ${name} has no SecretString`);
  return res.SecretString;
}

async function getApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;
  const v = await getSecret(API_KEY_SECRET_NAME);
  cachedApiKey = v;
  return v;
}

export async function getIpnSecret(): Promise<string> {
  if (cachedIpnSecret) return cachedIpnSecret;
  const v = await getSecret(IPN_SECRET_SECRET_NAME);
  cachedIpnSecret = v;
  return v;
}

export interface CreatePaymentParams {
  price_amount: number;
  price_currency: string; // "jpy"
  pay_currency?: string; // "btc", "usdttrc20" 等(未指定なら NOWPayments の画面で選ばせる)
  order_id: string;
  order_description: string;
  ipn_callback_url: string;
  success_url: string;
  cancel_url: string;
}

export interface CreatePaymentResponse {
  id: string;
  invoice_url: string;
  order_id: string;
  price_amount: number;
  price_currency: string;
  pay_amount?: number;
  pay_currency?: string;
}

export async function createInvoice(params: CreatePaymentParams): Promise<CreatePaymentResponse> {
  const apiKey = await getApiKey();
  const res = await fetch(`${BASE_URL}/invoice`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NOWPayments createInvoice failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<CreatePaymentResponse>;
}

/**
 * IPN(webhook)の HMAC SHA-512 署名を検証する。
 * 参考: https://documenter.getpostman.com/view/7907941/S1a32n38
 * - ヘッダー名: x-nowpayments-sig
 * - 検証対象: JSON body をキー昇順でソートしたもの
 */
export async function verifyIpnSignature(rawBody: string, signature: string): Promise<boolean> {
  const ipnSecret = await getIpnSecret();
  const parsed = JSON.parse(rawBody);
  const sorted = sortObjectKeys(parsed);
  const sortedJson = JSON.stringify(sorted);
  const expected = createHmac('sha512', ipnSecret).update(sortedJson).digest('hex');
  return timingSafeEqualHex(expected, signature);
}

function sortObjectKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  if (obj && typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[k] = sortObjectKeys((obj as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return obj;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
