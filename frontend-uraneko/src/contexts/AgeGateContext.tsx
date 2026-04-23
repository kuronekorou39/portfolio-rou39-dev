import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const COOKIE_NAME = 'uraneko_age_confirmed';
const COOKIE_MAX_AGE_DAYS = 30;

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[-.+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function writeCookie(name: string, value: string, maxAgeDays: number) {
  const maxAge = maxAgeDays * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax; Secure`;
}

interface AgeGateCtx {
  confirmed: boolean;
  confirm: () => void;
  deny: () => void;
}

const Ctx = createContext<AgeGateCtx | null>(null);

export function AgeGateProvider({ children }: { children: ReactNode }) {
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    setConfirmed(readCookie(COOKIE_NAME) === '1');
  }, []);

  const confirm = () => {
    writeCookie(COOKIE_NAME, '1', COOKIE_MAX_AGE_DAYS);
    setConfirmed(true);
  };

  const deny = () => {
    window.location.href = 'https://rou39.com';
  };

  return <Ctx.Provider value={{ confirmed, confirm, deny }}>{children}</Ctx.Provider>;
}

export function useAgeGate(): AgeGateCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAgeGate must be used within AgeGateProvider');
  return ctx;
}
