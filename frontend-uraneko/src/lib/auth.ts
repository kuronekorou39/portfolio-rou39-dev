import {
  CognitoUserPool,
  CognitoUser,
  CognitoUserSession,
  CognitoIdToken,
  CognitoAccessToken,
  CognitoRefreshToken,
} from 'amazon-cognito-identity-js';

// 本家 rou39.com と同じ UserPool を共有(uraneko 用 App Client のみ新規)
const USER_POOL_ID = 'ap-northeast-1_FJeIsc61q';

// uraneko 用 App Client ID(UranekoAuthClientStack が作成 / CfnOutput UranekoUserPoolClientId)。
// Cognito の SPA 用 App Client ID はブラウザバンドルに露出する公開値(秘密ではない)なので、
// 本家 frontend/ と同様にソースへ直書きする。これによりクリーンビルドでも再現性を保つ。
// UranekoAuthClient スタックを作り直して ClientId が変わった場合のみ、この値を更新すること。
const CLIENT_ID = '2tl63ie3vglgsicfo4iaprpdtu';

const COGNITO_DOMAIN = 'https://auth.rou39.com';

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

export function getGoogleLoginUrl(): string {
  const redirectUri = `${window.location.origin}/auth/callback`;
  return `${COGNITO_DOMAIN}/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&identity_provider=Google&scope=openid+email+profile`;
}

export function getCognitoLoginUrl(): string {
  const redirectUri = `${window.location.origin}/auth/callback`;
  return `${COGNITO_DOMAIN}/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=openid+email+profile`;
}

export async function exchangeOAuthCode(code: string): Promise<AuthUser> {
  const redirectUri = `${window.location.origin}/auth/callback`;
  const res = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
      code,
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
