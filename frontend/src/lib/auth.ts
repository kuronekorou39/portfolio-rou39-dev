import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
  CognitoUserSession,
  CognitoIdToken,
  CognitoAccessToken,
  CognitoRefreshToken,
} from 'amazon-cognito-identity-js';
import { generateRandomIdentity } from './avatars';

const USER_POOL_ID = 'ap-northeast-1_FJeIsc61q';
const CLIENT_ID = '1pdmjkcrrdcu18bpt30een85o3';
const COGNITO_DOMAIN = 'https://auth.rou39.com';

const userPool = new CognitoUserPool({
  UserPoolId: USER_POOL_ID,
  ClientId: CLIENT_ID,
});

export interface AuthUser {
  userId: string;
  email: string;
  nickname: string;
  avatar: string; // avatar key (e.g. "rabbit")
}

function sessionToUser(session: CognitoUserSession): AuthUser {
  const payload = session.getIdToken().decodePayload();
  return {
    userId: payload.sub as string,
    email: payload.email as string,
    nickname: (payload.nickname as string) || '匿名',
    avatar: (payload.picture as string) || '',
  };
}

export function getCurrentUser(): Promise<AuthUser | null> {
  return new Promise((resolve) => {
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) {
      resolve(null);
      return;
    }
    cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session?.isValid()) {
        resolve(null);
        return;
      }
      resolve(sessionToUser(session));
    });
  });
}

export function getIdToken(): Promise<string | null> {
  return new Promise((resolve) => {
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) {
      resolve(null);
      return;
    }
    cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session?.isValid()) {
        resolve(null);
        return;
      }
      resolve(session.getIdToken().getJwtToken());
    });
  });
}

export function signUp(email: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const { nickname, avatarKey } = generateRandomIdentity();
    const attributes = [
      new CognitoUserAttribute({ Name: 'email', Value: email }),
      new CognitoUserAttribute({ Name: 'nickname', Value: nickname }),
      new CognitoUserAttribute({ Name: 'picture', Value: avatarKey }),
    ];
    userPool.signUp(email, password, attributes, [], (err) => {
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve();
    });
  });
}

export function confirmSignUp(email: string, code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
    cognitoUser.confirmRegistration(code, true, (err) => {
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve();
    });
  });
}

export function signIn(email: string, password: string): Promise<AuthUser> {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });
    cognitoUser.authenticateUser(authDetails, {
      onSuccess: (session) => {
        resolve(sessionToUser(session));
      },
      onFailure: (err) => {
        reject(new Error(err.message));
      },
    });
  });
}

export function signOut(): void {
  const cognitoUser = userPool.getCurrentUser();
  if (cognitoUser) {
    cognitoUser.signOut();
  }
}

export function deleteAccount(): Promise<void> {
  return new Promise((resolve, reject) => {
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) {
      reject(new Error('Not signed in'));
      return;
    }
    cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session?.isValid()) {
        reject(new Error('Session invalid'));
        return;
      }
      cognitoUser.deleteUser((err) => {
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve();
      });
    });
  });
}

export function forgotPassword(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
    cognitoUser.forgotPassword({
      onSuccess: () => resolve(),
      onFailure: (err) => reject(new Error(err.message)),
    });
  });
}

export function confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
    cognitoUser.confirmPassword(code, newPassword, {
      onSuccess: () => resolve(),
      onFailure: (err) => reject(new Error(err.message)),
    });
  });
}

export function updateNickname(nickname: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) {
      reject(new Error('Not signed in'));
      return;
    }
    cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session?.isValid()) {
        reject(new Error('Session invalid'));
        return;
      }
      const attr = [new CognitoUserAttribute({ Name: 'nickname', Value: nickname })];
      cognitoUser.updateAttributes(attr, (err) => {
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve();
      });
    });
  });
}

export function updateAvatar(avatarKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) {
      reject(new Error('Not signed in'));
      return;
    }
    cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session?.isValid()) {
        reject(new Error('Session invalid'));
        return;
      }
      const attr = [new CognitoUserAttribute({ Name: 'picture', Value: avatarKey })];
      cognitoUser.updateAttributes(attr, (err) => {
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve();
      });
    });
  });
}

/**
 * Exchange an OAuth authorization code for tokens via Cognito's token endpoint,
 * then store them in localStorage so amazon-cognito-identity-js can pick them up.
 */
export async function exchangeOAuthCode(code: string): Promise<AuthUser> {
  // Validate state (CSRF) and pull the single-use PKCE verifier. Clear both up front.
  const returnedState = new URLSearchParams(window.location.search).get('state');
  const storedState = sessionStorage.getItem(OAUTH_STATE_KEY);
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  if (!storedState || storedState !== returnedState) {
    throw new Error('OAuth state mismatch (possible CSRF). Please sign in again.');
  }
  if (!verifier) {
    throw new Error('Missing PKCE verifier. Please sign in again.');
  }

  const redirectUri = `${window.location.origin}/auth/callback`;
  const tokenEndpoint = `${COGNITO_DOMAIN}/oauth2/token`;

  const response = await fetch(tokenEndpoint, {
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

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  const data = await response.json();
  const { id_token, access_token, refresh_token } = data;

  // Decode the id_token to extract the username (sub or cognito:username)
  const idToken = new CognitoIdToken({ IdToken: id_token });
  const payload = idToken.decodePayload();
  const username = (payload['cognito:username'] as string) || (payload.sub as string);

  // Build a CognitoUserSession
  const session = new CognitoUserSession({
    IdToken: idToken,
    AccessToken: new CognitoAccessToken({ AccessToken: access_token }),
    RefreshToken: new CognitoRefreshToken({ RefreshToken: refresh_token || '' }),
  });

  // Create a CognitoUser and set the session in localStorage
  const cognitoUser = new CognitoUser({
    Username: username,
    Pool: userPool,
  });
  cognitoUser.setSignInUserSession(session);

  return sessionToUser(session);
}

// --- PKCE (RFC 7636) + state for the OAuth authorization-code flow ---
// Public client (no client secret): PKCE prevents auth-code interception,
// state prevents login CSRF. verifier/state survive the redirect via sessionStorage.
const PKCE_VERIFIER_KEY = 'rou39_pkce_verifier';
const OAUTH_STATE_KEY = 'rou39_oauth_state';

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

/** Prepare PKCE + state, then redirect to Cognito Hosted UI (Google). */
export async function beginGoogleLogin(): Promise<void> {
  const verifier = randomUrlSafe(32); // base64url 43 chars (within PKCE 43-128)
  const state = randomUrlSafe(16);
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(OAUTH_STATE_KEY, state);
  const challenge = await pkceChallenge(verifier);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: `${window.location.origin}/auth/callback`,
    identity_provider: 'Google',
    scope: 'openid email profile',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  window.location.assign(`${COGNITO_DOMAIN}/oauth2/authorize?${params.toString()}`);
}
