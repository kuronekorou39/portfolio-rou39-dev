import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  getCurrentUser,
  getIdToken,
  signIn as authSignIn,
  signUp as authSignUp,
  confirmSignUp as authConfirmSignUp,
  signOut as authSignOut,
  updateNickname as authUpdateNickname,
  updateAvatar as authUpdateAvatar,
  exchangeOAuthCode as authExchangeOAuthCode,
} from '@/lib/auth';
import type { AuthUser } from '@/lib/auth';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  signOut: () => void;
  updateNickname: (nickname: string) => Promise<void>;
  updateAvatar: (avatarKey: string) => Promise<void>;
  exchangeOAuthCode: (code: string) => Promise<AuthUser>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getCurrentUser(), getIdToken()])
      .then(([u, t]) => {
        setUser(u);
        setToken(t);
      })
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const u = await authSignIn(email, password);
    const t = await getIdToken();
    setUser(u);
    setToken(t);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    await authSignUp(email, password);
  }, []);

  const confirmSignUp = useCallback(async (email: string, code: string) => {
    await authConfirmSignUp(email, code);
  }, []);

  const signOut = useCallback(() => {
    authSignOut();
    setUser(null);
    setToken(null);
  }, []);

  const updateNickname = useCallback(async (nickname: string) => {
    await authUpdateNickname(nickname);
    setUser((prev) => prev ? { ...prev, nickname } : prev);
  }, []);

  const updateAvatar = useCallback(async (avatarKey: string) => {
    await authUpdateAvatar(avatarKey);
    setUser((prev) => prev ? { ...prev, avatar: avatarKey } : prev);
  }, []);

  const exchangeOAuthCode = useCallback(async (code: string): Promise<AuthUser> => {
    const u = await authExchangeOAuthCode(code);
    const t = await getIdToken();
    setUser(u);
    setToken(t);
    return u;
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, signIn, signUp, confirmSignUp, signOut, updateNickname, updateAvatar, exchangeOAuthCode }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
