import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { exchangeOAuthCode } from '../lib/auth';
import { useAuth } from '../contexts/AuthContext';
import SectionLabel from '../components/bar/SectionLabel';

export default function AuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get('code');
    if (!code) {
      setErr('認可コードがありません');
      return;
    }
    (async () => {
      try {
        await exchangeOAuthCode(code);
        await refresh();
        navigate('/', { replace: true });
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, [params, navigate, refresh]);

  return (
    <div style={{ textAlign: 'center', padding: '80px 0' }}>
      <SectionLabel style={{ marginBottom: 18 }}>
        — {err ? 'SIGN IN FAILED' : 'SIGNING IN'}
      </SectionLabel>
      <p
        style={{
          fontFamily: 'var(--font-serif-jp)',
          fontSize: 16,
          color: err ? '#e66' : 'var(--muted)',
          letterSpacing: 2,
        }}
      >
        {err ? err : '楽屋口を確認しております...'}
      </p>
    </div>
  );
}
