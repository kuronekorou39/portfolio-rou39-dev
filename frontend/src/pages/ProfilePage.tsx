import { useState, useEffect } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { avatars, getAvatarEmoji, generateRandomIdentity } from '@/lib/avatars';
import { deleteAccount } from '@/lib/auth';

export default function ProfilePage() {
  const { user, loading, updateNickname, updateAvatar, signOut } = useAuth();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (user && !initialized) {
      setNickname(user.nickname);
      setSelectedAvatar(user.avatar);
      setInitialized(true);
    }
  }, [user, initialized]);

  if (!loading && !user) {
    return <Navigate to="/auth" replace />;
  }

  const hasChanges = user && (nickname !== user.nickname || selectedAvatar !== user.avatar);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      if (nickname !== user.nickname) await updateNickname(nickname);
      if (selectedAvatar !== user.avatar) await updateAvatar(selectedAvatar);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // エラー時はボタンが元に戻るだけ
    } finally {
      setSaving(false);
    }
  }

  function handleRandomNickname() {
    const { nickname: newName } = generateRandomIdentity();
    setNickname(newName);
  }

  function handleRandomAvatar() {
    const randomIndex = Math.floor(Math.random() * avatars.length);
    setSelectedAvatar(avatars[randomIndex].key);
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

        {/* Current avatar preview */}
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-5xl">
            {getAvatarEmoji(selectedAvatar)}
          </div>
          <p className="mt-2 text-sm text-white/40">{nickname}</p>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          {/* Avatar selection */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs text-white/40">Avatar</label>
              <button
                type="button"
                onClick={handleRandomAvatar}
                className="text-xs text-white/30 transition-colors hover:text-white/60"
              >
                🎲 ランダム
              </button>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {avatars.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setSelectedAvatar(a.key)}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-2xl transition-all hover:scale-105 ${
                    selectedAvatar === a.key
                      ? 'border-white/40 bg-white/10'
                      : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'
                  }`}
                  title={a.label}
                >
                  <span>{a.emoji}</span>
                  <span className="text-[10px] text-white/30">{a.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Nickname */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-white/40">Nickname</label>
              <button
                type="button"
                onClick={handleRandomNickname}
                className="text-xs text-white/30 transition-colors hover:text-white/60"
              >
                🎲 ランダム
              </button>
            </div>
            <input
              type="text"
              placeholder="ニックネーム"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className={inputClass}
              required
              maxLength={30}
            />
            <div className="mt-1 text-right text-xs text-white/20">
              {nickname.length}/30
            </div>
          </div>

          {/* Email (read-only) */}
          <div>
            <label className="mb-1 block text-xs text-white/40">Email</label>
            <input
              type="email"
              value={user?.email ?? ''}
              className={`${inputClass} cursor-not-allowed opacity-50`}
              readOnly
            />
          </div>

          <button
            type="submit"
            disabled={saving || (!hasChanges && !saved)}
            className={`${btnClass} ${saved ? '!bg-emerald-500 !text-white' : ''}`}
          >
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
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

        {/* Delete account */}
        <div className="mb-12 mt-12 border-t border-white/[0.06] pt-6">
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full text-center text-xs text-white/15 transition-colors hover:text-red-400/50"
            >
              アカウントを削除
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-center text-xs text-red-400/70">
                アカウントを削除するとログインできなくなります。投稿済みのレビューは匿名のまま残ります。この操作は取り消せません。
              </p>
              <p className="text-center text-xs text-white/30">
                確認のため「<span className="text-white/60">削除</span>」と入力してください
              </p>
              <input
                type="text"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                placeholder="削除"
                className="w-full rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2 text-center text-sm text-white placeholder-white/15 outline-none focus:border-red-500/40"
              />
              {deleteError && (
                <p className="text-center text-xs text-red-400">{deleteError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteInput(''); setDeleteError(''); }}
                  className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-xs text-white/40 transition-colors hover:border-white/20"
                >
                  キャンセル
                </button>
                <button
                  onClick={async () => {
                    if (deleteInput !== '削除') {
                      setDeleteError('「削除」と入力してください');
                      return;
                    }
                    setDeleting(true);
                    setDeleteError('');
                    try {
                      await deleteAccount();
                      signOut();
                      navigate('/');
                    } catch (err) {
                      setDeleteError(err instanceof Error ? err.message : '削除に失敗しました');
                    } finally {
                      setDeleting(false);
                    }
                  }}
                  disabled={deleting || deleteInput !== '削除'}
                  className="flex-1 rounded-lg bg-red-500/80 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-30"
                >
                  {deleting ? '削除中...' : 'アカウントを完全に削除'}
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
