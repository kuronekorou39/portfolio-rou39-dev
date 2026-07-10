import {
  CognitoUserPool,
  CognitoUser,
  CognitoUserSession,
  CognitoIdToken,
  CognitoAccessToken,
  CognitoRefreshToken,
} from 'amazon-cognito-identity-js';

// uraneko 専用 UserPool(UranekoAuthStack が作成 / CfnOutput UranekoUserPoolId)。
// 本家 rou39.com の portfolio-users とは会員基盤を分離している。
// このプレースホルダは意図的に CognitoUserPool の UserPoolId 形式チェックを通らない値に
// してあり、未設定のままビルドすると起動時に即例外になる(静かに壊れるのを防ぐ)。
// TODO: UranekoAuth デプロイ後、CfnOutput の実値へ更新すること(README「本番デプロイ」参照)
const USER_POOL_ID = 'SET-AFTER-URANEKO-AUTH-DEPLOY';

// uraneko 用 App Client ID(UranekoAuthStack が作成 / CfnOutput UranekoUserPoolClientId)。
// Cognito の SPA 用 App Client ID はブラウザバンドルに露出する公開値(秘密ではない)なので、
// 本家 frontend/ と同様にソースへ直書きする。これによりクリーンビルドでも再現性を保つ。
// UranekoAuth スタックを作り直して ClientId が変わった場合のみ、この値を更新すること。
// TODO: UranekoAuth デプロイ後、CfnOutput の実値へ更新すること(README「本番デプロイ」参照)
const CLIENT_ID = 'SET-AFTER-URANEKO-AUTH-DEPLOY';

const COGNITO_DOMAIN = 'https://uraneko-auth.rou39.com';

const userPool = new CognitoUserPool({
  UserPoolId: USER_POOL_ID,
  ClientId: CLIENT_ID,
});

export interface AuthUser {
  userId: string;
  email: string;
}

function sessionToUser(session: CognitoUserSession): AuthUser {
  const payload = session.getIdToken().decodePayload();
  return {
    userId: payload.sub as string,
    email: payload.email as string,
  };
}

export function getCurrentUser(): Promise<AuthUser | null> {
  return new Promise((resolve) => {
    const user = userPool.getCurrentUser();
    if (!user) return resolve(null);
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session?.isValid()) return resolve(null);
      resolve(sessionToUser(session));
    });
  });
}

export function getIdToken(): Promise<string | null> {
  return new Promise((resolve) => {
    const user = userPool.getCurrentUser();
    if (!user) return resolve(null);
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session?.isValid()) return resolve(null);
      resolve(session.getIdToken().getJwtToken());
    });
  });
}

export function signOut(): void {
  userPool.getCurrentUser()?.signOut();
}

// --- PKCE (RFC 7636) + state による OAuth 認可コードフローの保護 ---
// public client(client secret 無し)のため、認可コード傍受対策に PKCE、
// ログイン CSRF 対策に state を用いる。verifier/state は redirect を跨ぐので sessionStorage に保存。
const PKCE_VERIFIER_KEY = 'uraneko_pkce_verifier';
const OAUTH_STATE_KEY = 'uraneko_oauth_state';
const AUTH_RETURN_TO_KEY = 'uraneko_auth_return_to';

// ログイン完了後に戻るアプリ内パス。redirect を跨ぐので sessionStorage に保存する。
function rememberReturnTo(returnTo?: string): void {
  if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
    sessionStorage.setItem(AUTH_RETURN_TO_KEY, returnTo);
  } else {
    // 未指定なら前回ログイン中断時の残留値を消す(古いチェックアウトへ飛ばないように)
    sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
  }
}

/** ログイン開始時に保存した戻り先を取り出す(使い切り)。アプリ内パスのみ許可。 */
export function consumeAuthReturnTo(): string | null {
  const v = sessionStorage.getItem(AUTH_RETURN_TO_KEY);
  sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
  return v && v.startsWith('/') && !v.startsWith('//') ? v : null;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomUrlSafe(byteLength: number): string {
  const arr = new Uint8Array(byteLength);
  crypto.getRandomValues(arr);
  return base64UrlEncode(arr);
}
async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

async function beginOAuth(provider?: 'Google'): Promise<void> {
  const verifier = randomUrlSafe(32); // base64url 43 文字(PKCE 規定 43-128 内)
  const state = randomUrlSafe(16);
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(OAUTH_STATE_KEY, state);
  const challenge = await pkceChallenge(verifier);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: `${window.location.origin}/auth/callback`,
    scope: 'openid email profile',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  if (provider) params.set('identity_provider', provider);
  window.location.assign(`${COGNITO_DOMAIN}/oauth2/authorize?${params.toString()}`);
}

export function beginGoogleLogin(returnTo?: string): Promise<void> {
  rememberReturnTo(returnTo);
  return beginOAuth('Google');
}

export function beginCognitoLogin(returnTo?: string): Promise<void> {
  rememberReturnTo(returnTo);
  return beginOAuth();
}

export async function exchangeOAuthCode(code: string): Promise<AuthUser> {
  // state 検証(CSRF)+ PKCE verifier 取り出し。使い切りなので先にクリアする。
  const returnedState = new URLSearchParams(window.location.search).get('state');
  const storedState = sessionStorage.getItem(OAUTH_STATE_KEY);
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  if (!storedState || storedState !== returnedState) {
    throw new Error('state が一致しません(CSRF の疑い)。ログインをやり直してください。');
  }
  if (!verifier) {
    throw new Error('PKCE 検証値がありません。ログインをやり直してください。');
  }

  const redirectUri = `${window.location.origin}/auth/callback`;
  const res = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
      code,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${await res.text()}`);
  const { id_token, access_token, refresh_token } = await res.json();

  const idToken = new CognitoIdToken({ IdToken: id_token });
  const payload = idToken.decodePayload();
  const username = (payload['cognito:username'] as string) || (payload.sub as string);

  const session = new CognitoUserSession({
    IdToken: idToken,
    AccessToken: new CognitoAccessToken({ AccessToken: access_token }),
    RefreshToken: new CognitoRefreshToken({ RefreshToken: refresh_token || '' }),
  });

  const user = new CognitoUser({ Username: username, Pool: userPool });
  user.setSignInUserSession(session);

  return sessionToUser(session);
}
