// E2E テスト用: NOWPayments webhook を自前で署名して送信
// 使い方: node scripts/fake-nowpayments-webhook.mjs <order_id> [endpoint]
import { createHmac } from 'node:crypto';
import { execSync } from 'node:child_process';

const orderId = process.argv[2];
const endpoint =
  process.argv[3] || 'https://uraneko.rou39.com/api/webhooks/nowpayments';

if (!orderId) {
  console.error('usage: node fake-nowpayments-webhook.mjs <order_id> [endpoint]');
  process.exit(1);
}

// IPN secret を Secrets Manager から取得
const ipnSecret = execSync(
  'aws secretsmanager get-secret-value --secret-id uraneko/nowpayments/ipn-secret --query SecretString --output text',
  { encoding: 'utf8' },
).trim();

// NOWPayments webhook payload(finished = 支払い完了)
const payload = {
  payment_id: 1234567890,
  payment_status: 'finished',
  pay_address: 'bc1qfaketestaddress',
  price_amount: 5000,
  price_currency: 'jpy',
  pay_amount: 0.0004,
  actually_paid: 0.0004,
  pay_currency: 'btc',
  order_id: orderId,
  order_description: 'sample-1',
  purchase_id: 'fake-purchase-001',
  outcome_amount: 0.0004,
  outcome_currency: 'btc',
};

// HMAC-SHA512(キー昇順 sort 後の JSON)
function sortKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj && typeof obj === 'object') {
    const sorted = {};
    for (const k of Object.keys(obj).sort()) sorted[k] = sortKeys(obj[k]);
    return sorted;
  }
  return obj;
}
const body = JSON.stringify(payload);
const sortedJson = JSON.stringify(sortKeys(payload));
const sig = createHmac('sha512', ipnSecret).update(sortedJson).digest('hex');

console.log('POST', endpoint);
console.log('order_id:', orderId);

const res = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-nowpayments-sig': sig,
  },
  body,
});
const text = await res.text();
console.log('status:', res.status);
console.log('body:', text);
