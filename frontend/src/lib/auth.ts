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

/** Build the Google OAuth login URL for Cognito Hosted UI */
export function getGoogleLoginUrl(): string {
  const redirectUri = `${window.location.origin}/auth/callback`;
  return `${COGNITO_DOMAIN}/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&identity_provider=Google&scope=openid+email+profile`;
}
