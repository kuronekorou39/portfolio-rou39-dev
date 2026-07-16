import { createHmac } from 'crypto';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const BASE_URL = process.env.NOWPAYMENTS_BASE_URL || 'https://api.nowpayments.io/v1';
const API_KEY_SECRET_NAME = process.env.NOWPAYMENTS_API_KEY_SECRET!;

// 割引後の下限額(円)。これ未満は NOWPayments の最低取引額割れで invoice が失敗する。
// checkout(事前ガード)とクーポン検証 API(表示用チェック)で共用。
export const MIN_INVOICE_JPY = 100;
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

export interface CreateDirectPaymentParams {
  price_amount: number;
  price_currency: string; // "jpy"
  pay_currency: string; // "ltc" | "btc"(自前決済ページなので必須)
  order_id: string;
  order_description: string;
  ipn_callback_url: string;
}

export interface DirectPayment {
  payment_id: string;
  payment_status: string;
  pay_address: string;
  pay_amount: number; // 送金すべき暗号資産の数量
  pay_currency: string; // "ltc" | "btc"
  network?: string;
  payin_extra_id?: string | null; // 一部通貨のメモ/タグ(LTC/BTC では null)
  valid_until?: string | null; // 送金先の有効期限(ISO)。無い実装もある
}

/**
 * NOWPayments の「直接決済」を作成する(/v1/payment)。
 * ホスト画面(invoice)ではなく、送金先アドレス・数量・QR を uraneko 側で表示するため、
 * pay_currency を指定して pay_address / pay_amount を受け取る。
 * IPN の payment_status ライフサイクルは invoice と同一なので webhook はそのまま使える。
 */
export async function createPayment(params: CreateDirectPaymentParams): Promise<DirectPayment> {
  const apiKey = await getApiKey();
  const res = await fetch(`${BASE_URL}/payment`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NOWPayments createPayment failed: ${res.status} ${text}`);
  }
  const j = (await res.json()) as Record<string, unknown>;
  return {
    payment_id: String(j.payment_id),
    payment_status: String(j.payment_status ?? 'waiting'),
    pay_address: String(j.pay_address),
    pay_amount: Number(j.pay_amount),
    pay_currency: String(j.pay_currency ?? params.pay_currency),
    network: j.network != null ? String(j.network) : undefined,
    payin_extra_id: (j.payin_extra_id as string | null) ?? null,
    valid_until: (j.valid_until as string | null) ?? (j.expiration_estimate_date as string | null) ?? null,
  };
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
