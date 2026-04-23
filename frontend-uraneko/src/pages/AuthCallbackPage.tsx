import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { exchangeOAuthCode } from '../lib/auth';
import { useAuth } from '../contexts/AuthContext';

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

  if (err) return <p className="text-red-400">ログインに失敗しました: {err}</p>;
  return <p className="text-neutral-400">ログイン処理中...</p>;
}
