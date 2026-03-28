import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';

const userPool = new CognitoUserPool({
  UserPoolId: 'ap-northeast-1_FJeIsc61q',
  ClientId: '1pdmjkcrrdcu18bpt30een85o3',
});

export interface AuthUser {
  userId: string;
  email: string;
  nickname: string;
}

function sessionToUser(session: CognitoUserSession): AuthUser {
  const payload = session.getIdToken().decodePayload();
  return {
    userId: payload.sub as string,
    email: payload.email as string,
    nickname: (payload.nickname as string) || '匿名',
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
    const attributes = [
      new CognitoUserAttribute({ Name: 'email', Value: email }),
      new CognitoUserAttribute({ Name: 'nickname', Value: '匿名' }),
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
