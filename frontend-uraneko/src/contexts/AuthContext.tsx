import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getCurrentUser, signOut as signOutAuth, type AuthUser } from '../lib/auth';

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    setUser(await getCurrentUser());
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const signOut = () => {
    signOutAuth();
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, refresh, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
