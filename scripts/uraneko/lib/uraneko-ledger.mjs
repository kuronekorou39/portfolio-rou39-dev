/**
 * uraneko 会計台帳(ローカル JSON)
 *
 * 管理 GUI は 127.0.0.1 のローカル専用ツールなので、会計まわりの「運用データ」
 * (テスト注文の除外・手入力の経費・共同出資者への支払い履歴)は、AWS ではなく
 * この PC 上の JSON ファイルに置く。注文そのもの(DynamoDB)には手を入れない。
 *
 * 保存先: 既定は scripts/uraneko/uraneko-ledger.json(.gitignore 済み)。
 *         URANEKO_LEDGER_PATH で上書き可。
 *
 * ※ このファイルは共同出資者との精算の元帳になる。バックアップは運用者の責任
 *   (別ドライブ等へ定期コピー推奨)。壊れた JSON を黙って空で上書きしないよう、
 *   読めない場合は例外にして停止する。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const DEFAULT_PATH = fileURLToPath(new URL('../uraneko-ledger.json', import.meta.url));
export const LEDGER_PATH = process.env.URANEKO_LEDGER_PATH || DEFAULT_PATH;

// 入力エラーは 400 で返したいので、サーバ側が判別できるよう validation フラグを付ける
// (store.ValidationError と同じ扱いを uraneko-admin-server.mjs 側で行う)。
function invalid(msg) {
  throw Object.assign(new Error(msg), { validation: true });
}

function emptyLedger() {
  return { version: 3, excluded_order_ids: [], expenses: [], payouts: [], received_overrides: {} };
}

function read() {
  if (!existsSync(LEDGER_PATH)) return emptyLedger();
  let raw;
  try {
    raw = readFileSync(LEDGER_PATH, 'utf-8');
  } catch (e) {
    throw new Error('台帳ファイルが読めません: ' + LEDGER_PATH + ' — ' + e.message);
  }
  if (!raw.trim()) return emptyLedger();
  let j;
  try {
    j = JSON.parse(raw);
  } catch (e) {
    // 壊れた台帳を空で上書きすると精算履歴が消える。明示的に止める。
    throw new Error('台帳ファイルの JSON が壊れています(手動で修復してください): ' + LEDGER_PATH + ' — ' + e.message);
  }
  const ro = j.received_overrides;
  return {
    version: 3,
    excluded_order_ids: Array.isArray(j.excluded_order_ids) ? j.excluded_order_ids.map(String) : [],
    expenses: Array.isArray(j.expenses) ? j.expenses : [],
    payouts: Array.isArray(j.payouts) ? j.payouts : [],
    // 受領コインの手入力上書き(order_id → { currency, amount })。outcome 未記録の注文を実着金額で正す用。
    received_overrides: ro && typeof ro === 'object' && !Array.isArray(ro) ? ro : {},
  };
}

function write(data) {
  const dir = dirname(LEDGER_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // 一時ファイルに書いてから rename でアトミック置換(書き込み中クラッシュで台帳を壊さない)。
  const tmp = LEDGER_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  renameSync(tmp, LEDGER_PATH);
}

// 精算は BTC / LTC をコインのまま通貨別に折半する。経費は円も持てる(税務・記録用=別管理)。
const COIN_CURRENCIES = ['btc', 'ltc'];
function validCurrency(currency, coinOnly) {
  const cur = String(currency || '').trim().toLowerCase();
  const allowed = coinOnly ? COIN_CURRENCIES : [...COIN_CURRENCIES, 'jpy'];
  if (!allowed.includes(cur)) invalid('通貨は ' + allowed.map((c) => c.toUpperCase()).join(' / ') + ' で指定してください');
  return cur;
}
function validAmount(n, currency) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) invalid('金額は 0 以上の数値で入力してください');
  if (currency === 'jpy') return Math.round(v);   // 円は整数
  return Math.round(v * 1e8) / 1e8;               // コインは 8 桁(satoshi/litoshi)まで
}

function validDate(s) {
  const str = String(s || '').trim();
  if (!str) return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }); // 今日(JST)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) invalid('日付は YYYY-MM-DD 形式で入力してください');
  return str;
}

/** 台帳全体を返す(UI 表示・集計用)。path は表示のために同梱。 */
export function getLedger() {
  return { ...read(), path: LEDGER_PATH };
}

/** テスト注文などを会計から除外/復帰する。 */
export function setExcluded(order_id, excluded) {
  if (!order_id) invalid('order_id が必要です');
  const d = read();
  const set = new Set(d.excluded_order_ids);
  if (excluded) set.add(String(order_id));
  else set.delete(String(order_id));
  d.excluded_order_ids = [...set];
  write(d);
  return { order_id: String(order_id), excluded: set.has(String(order_id)) };
}

/**
 * 手入力の経費。通貨は BTC / LTC / JPY。
 *  - コイン(BTC/LTC)の経費 = 送金手数料など。そのコインの折半前に差し引く。
 *  - 円(JPY)の経費 = サーバ代・ドメイン等。税務・記録用の別管理(コイン精算には影響させない)。
 */
export function addExpense({ date, currency, label, amount, note } = {}) {
  const d = read();
  const cur = validCurrency(currency, false);
  const item = {
    id: randomUUID(),
    date: validDate(date),
    currency: cur,
    label: String(label || '').trim() || '(名目なし)',
    amount: validAmount(amount, cur),
    note: String(note || '').trim(),
  };
  d.expenses.push(item);
  write(d);
  return item;
}

export function deleteExpense(id) {
  if (!id) invalid('id が必要です');
  const d = read();
  const before = d.expenses.length;
  d.expenses = d.expenses.filter((e) => e.id !== id);
  if (d.expenses.length === before) invalid('該当の経費が見つかりません: ' + id);
  write(d);
  return { ok: true, id };
}

/** 共同出資者への支払い(精算)履歴。BTC / LTC をコインのまま記録する。 */
export function addPayout({ date, currency, amount, note } = {}) {
  const d = read();
  const cur = validCurrency(currency, true); // 送金は BTC / LTC のみ
  const item = {
    id: randomUUID(),
    date: validDate(date),
    currency: cur,
    amount: validAmount(amount, cur),
    note: String(note || '').trim(),
  };
  d.payouts.push(item);
  write(d);
  return item;
}

export function deletePayout(id) {
  if (!id) invalid('id が必要です');
  const d = read();
  const before = d.payouts.length;
  d.payouts = d.payouts.filter((p) => p.id !== id);
  if (d.payouts.length === before) invalid('該当の支払いが見つかりません: ' + id);
  write(d);
  return { ok: true, id };
}

/**
 * 受領コインの手入力上書き。outcome_amount が未記録の注文について、ウォレットの実着金額を
 * 手で入れて精算を正すためのもの(注文データは変更せず、この台帳に order_id で覚える)。
 */
export function setReceivedOverride({ order_id, currency, amount } = {}) {
  if (!order_id) invalid('order_id が必要です');
  const cur = validCurrency(currency, true); // 受領は BTC / LTC のみ
  const amt = validAmount(amount, cur);
  const d = read();
  if (!d.received_overrides || typeof d.received_overrides !== 'object' || Array.isArray(d.received_overrides)) d.received_overrides = {};
  d.received_overrides[String(order_id)] = { currency: cur, amount: amt };
  write(d);
  return { order_id: String(order_id), currency: cur, amount: amt };
}

export function clearReceivedOverride(order_id) {
  if (!order_id) invalid('order_id が必要です');
  const d = read();
  if (d.received_overrides) delete d.received_overrides[String(order_id)];
  write(d);
  return { ok: true, order_id: String(order_id) };
}
