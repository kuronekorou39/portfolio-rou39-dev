import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { exchangeOAuthCode } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (errorParam) {
      setError(errorDescription || errorParam);
      return;
    }

    if (!code) {
      setError('No authorization code received');
      return;
    }

    exchangeOAuthCode(code)
      .then(() => {
        navigate('/apps', { replace: true });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Authentication failed');
      });
  }, [searchParams, exchangeOAuthCode, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#060608] px-6">
      <div className="text-center">
        {error ? (
          <>
            <p className="mb-4 text-red-400">{error}</p>
            <a
              href="/auth"
              className="text-sm text-white/50 underline hover:text-white"
            >
              Back to login
            </a>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
            <p className="text-sm text-white/40">Signing in...</p>
          </>
        )}
      </div>
    </div>
  );
}
