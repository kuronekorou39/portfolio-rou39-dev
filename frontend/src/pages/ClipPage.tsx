import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { createClip } from '@/lib/api';

const MAX_BYTES = 300 * 1024;

function byteLength(str: string): number {
  return new Blob([str]).size;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function ClipPage() {
  const [text, setText] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const textBytes = useMemo(() => byteLength(text), [text]);
  const overLimit = textBytes > MAX_BYTES;

  const clipUrl = code ? `${window.location.origin}/clip/${code}` : '';

  async function handleSubmit() {
    if (!text.trim() || overLimit) return;
    setLoading(true);
    setError(null);
    try {
      const result = await createClip(text);
      setCode(result.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyUrl() {
    try {
      await navigator.clipboard.writeText(clipUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  function handleReset() {
    setText('');
    setCode(null);
    setError(null);
    setCopied(false);
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
        <p className="mb-8 text-sm text-white/40">
          テキストを貼り付けてリンクを生成。30分で自動削除されます。
        </p>

        <AnimatePresence mode="wait">
          {!code ? (
            <motion.div
              key="input"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Text input */}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="テキストを入力..."
                rows={10}
                className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-white/20 outline-none transition-colors focus:border-white/25"
              />

              {/* Byte counter */}
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className={overLimit ? 'text-red-400' : 'text-white/30'}>
                  {formatBytes(textBytes)} / {formatBytes(MAX_BYTES)}
                </span>
                {overLimit && (
                  <span className="text-red-400">
                    サイズ上限を超えています
                  </span>
                )}
              </div>

              {/* Error */}
              {error && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-3 text-sm text-red-400"
                >
                  {error}
                </motion.p>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!text.trim() || overLimit || loading}
                className="mt-6 w-full rounded-xl bg-white py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-30"
              >
                {loading ? '生成中...' : 'リンクを生成'}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* QR Code */}
              <div className="flex justify-center">
                <div className="rounded-2xl bg-white p-4">
                  <QRCodeSVG
                    value={clipUrl}
                    size={180}
                    level="M"
                  />
                </div>
              </div>

              {/* URL + Copy */}
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="mb-2 text-xs font-medium text-white/40">
                  共有リンク
                </p>
                <p className="mb-3 break-all text-sm text-white/80">
                  {clipUrl}
                </p>
                <button
                  onClick={handleCopyUrl}
                  className="w-full rounded-lg bg-white/10 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/15"
                >
                  {copied ? 'コピーしました' : 'URLをコピー'}
                </button>
              </div>

              {/* Info */}
              <p className="text-center text-xs text-white/30">
                このリンクは30分後に無効になります
              </p>

              {/* Reset */}
              <button
                onClick={handleReset}
                className="w-full rounded-xl border border-white/10 py-3 text-sm font-medium text-white/50 transition-colors hover:border-white/20 hover:text-white/70"
              >
                新しいClipを作成
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
