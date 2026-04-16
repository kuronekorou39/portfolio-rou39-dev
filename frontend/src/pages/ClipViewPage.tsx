import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { fetchClip } from '@/lib/api';

export default function ClipViewPage() {
  const { code } = useParams<{ code: string }>();
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    fetchClip(code)
      .then((data) => setText(data.text))
      .catch((e) => setError(e instanceof Error ? e.message : 'not_found'))
      .finally(() => setLoading(false));
  }, [code]);

  async function handleCopy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="mb-2 text-3xl font-black tracking-tight text-white">
          Clip
        </h1>

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-2 py-12 text-sm text-white/40">
            <motion.div
              className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white/60"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
            />
            読み込み中...
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6 py-8"
          >
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
              <p className="mb-2 text-4xl">🔍</p>
              <p className="text-sm text-white/50">
                このClipは見つかりません
              </p>
              <p className="mt-1 text-xs text-white/25">
                期限切れまたは無効なコードです
              </p>
            </div>
            <Link
              to="/clip"
              className="block w-full rounded-xl bg-white py-3 text-center text-sm font-semibold text-black transition-opacity hover:opacity-90"
            >
              新しいClipを作成
            </Link>
          </motion.div>
        )}

        {/* Success */}
        {!loading && text !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <p className="text-sm text-white/40">
              共有されたテキスト
            </p>

            {/* Text display */}
            <div className="max-h-[60vh] overflow-auto rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <pre className="whitespace-pre-wrap break-all text-sm leading-relaxed text-white/80">
                {text}
              </pre>
            </div>

            {/* Copy button */}
            <button
              onClick={handleCopy}
              className="w-full rounded-xl bg-white py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90"
            >
              {copied ? 'コピーしました' : 'テキストをコピー'}
            </button>

            {/* Create new */}
            <Link
              to="/clip"
              className="block w-full rounded-xl border border-white/10 py-3 text-center text-sm font-medium text-white/50 transition-colors hover:border-white/20 hover:text-white/70"
            >
              新しいClipを作成
            </Link>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
