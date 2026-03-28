import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';

export default function ProfilePage() {
  const { user, loading, updateNickname } = useAuth();
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (user) {
      setNickname(user.nickname);
    }
  }, [user]);

  if (!loading && !user) {
    return <Navigate to="/auth" replace />;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setSaving(true);
    try {
      await updateNickname(nickname);
      setMessage('ニックネームを更新しました');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '更新に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    'w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-white/25 outline-none transition-colors focus:border-white/30';
  const btnClass =
    'w-full rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100';

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060608]">
        <p className="text-sm text-white/40">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#060608] px-6">
      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="mb-8 text-center text-3xl font-black tracking-tight text-white">
          My Page
        </h1>

        {message && (
          <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/60">
            {message}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-white/40">Nickname</label>
            <input
              type="text"
              placeholder="ニックネーム"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className={inputClass}
              required
              maxLength={30}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-white/40">Email</label>
            <input
              type="email"
              value={user?.email ?? ''}
              className={`${inputClass} cursor-not-allowed opacity-50`}
              readOnly
            />
          </div>

          <button type="submit" disabled={saving} className={btnClass}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </form>

        <p className="mt-6 text-center">
          <Link
            to="/apps"
            className="text-sm text-white/30 underline hover:text-white/60"
          >
            Back to Apps
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
