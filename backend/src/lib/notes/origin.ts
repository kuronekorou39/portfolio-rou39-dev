import { timingSafeEqual } from 'crypto';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import type { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * execute-api の直叩き遮断。
 *
 * CloudFront の /api/* オリジンにだけ秘密ヘッダ `x-origin-verify` を付与し、公開系ハンドラが
 * それを検証する。直叩き経路は CloudFront 付与の WAF(IPレート制限)を回避でき、XFF を偽装して
 * アクセスログの記録 IP を汚染できるため、その抜け道を塞ぐ多層防御。
 * (書き込み濫用そのものは per-token スロットルが本命防御。これは経路の正当性を担保する層。)
 */
const HEADER = 'x-origin-verify';
const SECRET_NAME = process.env.ORIGIN_VERIFY_SECRET; // secretName。未設定なら検証しない(安全側)
const ENFORCE = process.env.ORIGIN_VERIFY_ENFORCE === 'true';

const sm = new SecretsManagerClient({});
// 値ではなく Promise をキャッシュする。取得中に来た並行リクエストが往復を重複させない。
let cached: Promise<string> | null = null;

function expectedSecret(): Promise<string | null> {
  if (!SECRET_NAME) return Promise.resolve(null);
  if (!cached) {
    const p = sm
      .send(new GetSecretValueCommand({ SecretId: SECRET_NAME }))
      .then((res) => res.SecretString ?? '');
    // 失敗はキャッシュしない(次のリクエストで取り直せるようにする)。
    // ここで catch を付けておかないと prefetch 時に unhandled rejection になる。
    p.catch(() => {
      if (cached === p) cached = null;
    });
    cached = p;
  }
  return cached;
}

/**
 * 秘密の取得をコールドスタートの init フェーズで開始する。
 *
 * ハンドラ内で初めて触ると Secrets Manager への往復がそのまま応答時間に乗る。
 * モジュール読み込み時に先行させれば、ハンドラが await する頃には解決済みになる
 * (init フェーズは課金対象の Duration に含まれない)。呼ばなくても動作は変わらない。
 */
export function prefetchOriginSecret(): void {
  void expectedSecret().catch(() => {});
}

/** ヘッダ名は大文字小文字を問わず拾う(API Gateway/経路により casing が変わりうる)。 */
function headerValue(event: APIGatewayProxyEvent): string {
  const h = event.headers ?? {};
  for (const k of Object.keys(h)) {
    if (k.toLowerCase() === HEADER) return h[k] ?? '';
  }
  return '';
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false; // 長さ差はタイミングに関わらず false
  return timingSafeEqual(ab, bb);
}

/**
 * リクエストが自分の CloudFront 経由かを検証する。
 *
 * フェイルセーフ設計(可用性優先):
 * - ORIGIN_VERIFY_SECRET 未設定 / 取得失敗 → true(検証せず通す。導入前・障害時に全滅させない)
 * - ENFORCE=false(ロールアウト Phase 1)→ 判定はするが必ず true。CloudFront が実際に
 *   ヘッダを配信できているかを、秘密値は出さず「present / match / 長さ」だけログして確認する
 *   (CloudFront カスタムヘッダで動的参照が解決されるかの検証もここで済ませる)
 * - ENFORCE=true(Phase 2)→ 不一致/欠落なら false(呼び出し側が 403 を返す)
 *
 * @returns true=通過させてよい / false=遮断(403)すべき
 */
export async function passesOriginCheck(event: APIGatewayProxyEvent): Promise<boolean> {
  let expected: string | null;
  try {
    expected = await expectedSecret();
  } catch (err) {
    console.error('origin-verify: secret fetch failed (fail-open):', (err as Error)?.name);
    return true;
  }
  if (!expected) return true; // 秘密未配備 → 検証しない

  const got = headerValue(event);
  const match = got.length > 0 && safeEqual(got, expected);

  if (ENFORCE) {
    if (!match) {
      console.warn(
        `origin-verify blocked: present=${got.length > 0} gotLen=${got.length} expLen=${expected.length}`,
      );
    }
    return match;
  }
  // Phase 1: 遮断しない。CloudFront がヘッダを配信できているかの観測ログ(秘密値は出さない)。
  console.log(
    `origin-verify observe: present=${got.length > 0} match=${match} gotLen=${got.length} expLen=${expected.length}`,
  );
  return true;
}
