import { CognitoJwtVerifier } from 'aws-jwt-verify';

const USER_POOL_ID = process.env.URANEKO_USER_POOL_ID!;
const CLIENT_ID = process.env.URANEKO_CLIENT_ID!;

// Cognito ID トークン検証器(JWKS を取得・キャッシュ)。モジュールスコープで使い回す。
let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;
function getVerifier() {
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: USER_POOL_ID,
      tokenUse: 'id',
      clientId: CLIENT_ID,
    });
  }
  return verifier;
}

export interface Member {
  sub: string;
  email: string;
}

/**
 * Authorization: Bearer <IDトークン> を検証してログイン会員を返す。
 * checkout / get-order にはオーソライザーを付けない(ゲスト併用)ため、Lambda 側で
 * 自前検証する。ヘッダー無し / 無効なら null(=ゲスト扱い)。fail-closed。
 */
export async function verifyMember(
  authHeader: string | undefined | null,
): Promise<Member | null> {
  if (!authHeader) return null;
  const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const payload = await getVerifier().verify(token);
    const sub = String(payload.sub);
    const email = typeof payload.email === 'string' ? payload.email : '';
    return sub ? { sub, email } : null;
  } catch {
    return null;
  }
}

// API Gateway はヘッダー名の大小を保持しないことがあるため両方見る。
export function authHeaderOf(event: {
  headers?: Record<string, string | undefined> | null;
}): string | undefined {
  const h = event.headers ?? {};
  return h.Authorization ?? h.authorization ?? undefined;
}
