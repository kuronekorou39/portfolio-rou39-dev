import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = '/api';

function genSessionId(): string {
  const stored = sessionStorage.getItem('hp_sid');
  if (stored) return stored;
  const id = crypto.randomUUID();
  sessionStorage.setItem('hp_sid', id);
  return id;
}

async function logEvent(type: string, data: Record<string, unknown> = {}) {
  try {
    await fetch(`${API_BASE}/honeypot/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, type, sessionId: genSessionId() }),
    });
  } catch { /* silent */ }
}

export default function AdminLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    logEvent('visit', { page: '/admin' });
    // If already "logged in", redirect
    if (sessionStorage.getItem('hp_token')) {
      navigate('/admin/dashboard', { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('ユーザー名とパスワードを入力してください');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/honeypot/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'login-attempt',
          username,
          password,
          sessionId: genSessionId(),
        }),
      });
      const data = await res.json();

      if (data.success) {
        sessionStorage.setItem('hp_token', data.token);
        sessionStorage.setItem('hp_user', username);
        navigate('/admin/dashboard');
      } else {
        setAttempts((a) => a + 1);
        if (attempts >= 2) {
          setError('認証に失敗しました。アカウントがロックされる可能性があります。');
        } else {
          setError('ユーザー名またはパスワードが正しくありません');
        }
      }
    } catch {
      setError('サーバーに接続できません');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f1117]">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600 text-xl font-bold text-white">
            R
          </div>
          <h1 className="text-lg font-semibold text-white">管理者ログイン</h1>
          <p className="mt-1 text-xs text-gray-500">rou39.com Administration Panel</p>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="rounded-xl border border-gray-800 bg-[#161b22] p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-900/50 bg-red-900/20 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-gray-400">
              ユーザー名
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-[#0d1117] px-3 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition-colors focus:border-blue-500"
              placeholder="admin"
              autoComplete="off"
              autoFocus
            />
          </div>

          <div className="mb-6">
            <label className="mb-1.5 block text-xs font-medium text-gray-400">
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-[#0d1117] px-3 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition-colors focus:border-blue-500"
              placeholder="••••••••"
              autoComplete="off"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        {/* Footer */}
        <p className="mt-6 text-center text-[10px] text-gray-600">
          &copy; 2026 rou39.com &middot; Unauthorized access is prohibited
        </p>
      </div>
    </div>
  );
}
