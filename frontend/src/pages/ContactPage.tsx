import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { submitContact } from '@/lib/api';

const CATEGORIES = [
  { value: 'work', label: '仕事の依頼' },
  { value: 'feedback', label: 'フィードバック' },
  { value: 'other', label: 'その他' },
];

const MESSAGE_MAX = 5000;

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState('work');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Anti-spam: page load timestamp
  const loadedAt = useRef(Date.now());

  const canSubmit = name.trim() && email.trim() && message.trim() && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    try {
      await submitContact({
        name,
        email,
        category,
        message,
        _hp: '', // honeypot — must be empty
        _ts: loadedAt.current,
      });
      setSent(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('rate_limited')) {
        setError('送信間隔が短すぎます。しばらく待ってからお試しください。');
      } else {
        setError('送信に失敗しました。時間をおいて再度お試しください。');
      }
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <p className="mb-4 text-5xl">✉️</p>
          <h1 className="mb-3 text-2xl font-bold text-white">
            送信しました
          </h1>
          <p className="text-sm text-white/40">
            ご連絡ありがとうございます。内容を確認のうえ、折り返しご連絡いたします。
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="mb-2 text-3xl font-black tracking-tight text-white">
          Contact
        </h1>
        <p className="mb-8 text-sm text-white/40">
          お仕事の依頼やフィードバックなど、お気軽にどうぞ。
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Honeypot — invisible to users */}
          <div className="absolute -left-[9999px] opacity-0" aria-hidden="true">
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </div>

          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/50">
              お名前 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-white/20 outline-none transition-colors focus:border-white/25"
              placeholder="山田 太郎"
            />
          </div>

          {/* Email */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/50">
              メールアドレス <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-white/20 outline-none transition-colors focus:border-white/25"
              placeholder="you@example.com"
            />
          </div>

          {/* Category */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/50">
              種別 <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`rounded-full border px-4 py-2 text-xs font-medium transition-all ${
                    category === cat.value
                      ? 'border-white/20 bg-white/10 text-white'
                      : 'border-white/[0.06] text-white/30 hover:border-white/15 hover:text-white/50'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/50">
              メッセージ <span className="text-red-400">*</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              maxLength={MESSAGE_MAX}
              className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-white/20 outline-none transition-colors focus:border-white/25"
              placeholder="ご用件をお聞かせください..."
            />
            <p className="mt-1 text-right text-xs text-white/20">
              {message.length} / {MESSAGE_MAX}
            </p>
          </div>

          {/* Error */}
          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-red-400"
            >
              {error}
            </motion.p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-xl bg-white py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            {loading ? '送信中...' : '送信する'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
