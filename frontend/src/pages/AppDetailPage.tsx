import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Markdown from 'react-markdown';
import { categoryLabel, categoryEmoji, statusLabel } from '@/data/mockProjects';
import { fetchProject, fetchReviews, createReview, updateReview, deleteReview, incrementPageView, getDownloadUrl } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import type { Project } from '../../../shared/src/types';
import type { Review } from '../../../shared/src/types';

type Tab = 'about' | 'howto' | 'reviews';

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={`text-sm ${star <= rating ? 'text-yellow-400' : 'text-white/10'}`}
        >
          ★
        </span>
      ))}
    </div>
  );
}

function InteractiveStarRating({
  rating,
  onChange,
}: {
  rating: number;
  onChange: (value: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          className={`text-xl transition-colors ${
            star <= (hover || rating) ? 'text-yellow-400' : 'text-white/10'
          } hover:scale-110`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function AppDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('about');
  const [project, setProject] = useState<Project | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);

  // Review form state
  const [newRating, setNewRating] = useState(0);
  const [newContent, setNewContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRating, setEditRating] = useState(0);
  const [editContent, setEditContent] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const reloadReviews = useCallback(() => {
    if (!id) return;
    fetchReviews(id).then(setReviews).catch(console.error);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetchProject(id)
      .then(setProject)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
    reloadReviews();
    incrementPageView(id).catch(console.error);
  }, [id, reloadReviews]);

  const handleSubmitReview = async () => {
    if (!id || !token || newRating === 0 || !newContent.trim()) return;
    setSubmitting(true);
    try {
      await createReview(id, { rating: newRating, content: newContent.trim() }, token);
      setNewRating(0);
      setNewContent('');
      reloadReviews();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = (review: Review) => {
    setEditingId(review.id);
    setEditRating(review.rating);
    setEditContent(review.content);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditRating(0);
    setEditContent('');
  };

  const handleSaveEdit = async (reviewId: string) => {
    if (!id || !token || editRating === 0 || !editContent.trim()) return;
    setEditSubmitting(true);
    try {
      await updateReview(id, reviewId, { rating: editRating, content: editContent.trim() }, token);
      setEditingId(null);
      reloadReviews();
    } catch (err) {
      console.error(err);
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!id || !token) return;
    try {
      await deleteReview(id, reviewId, token);
      reloadReviews();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownload = async () => {
    if (!id || !token) return;
    setDownloadLoading(true);
    try {
      const url = await getDownloadUrl(id, token);
      window.location.href = url;
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloadLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060608]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060608]">
        <div className="text-center">
          <p className="mb-4 text-6xl">🔍</p>
          <h1 className="mb-2 text-2xl font-bold text-white">Not Found</h1>
          <p className="mb-6 text-white/30">このプロダクトは見つかりませんでした</p>
          <Link to="/apps" className="text-sm text-white/50 underline hover:text-white">
            ← アプリ一覧に戻る
          </Link>
        </div>
      </div>
    );
  }

  const status = statusLabel[project.status];
  const avgRating = reviews.length > 0
    ? reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length
    : 0;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'about', label: 'About' },
    { key: 'howto', label: 'How to Use' },
    { key: 'reviews', label: `Reviews (${reviews.length})` },
  ];

  return (
    <div className="min-h-screen bg-[#060608] text-white">
      <div className="mx-auto max-w-4xl px-6 py-12">
        {/* Back link */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Link
            to="/apps"
            className="inline-flex items-center gap-2 text-sm text-white/30 transition-colors hover:text-white/60"
          >
            ← Apps
          </Link>
        </motion.div>

        {/* Hero section */}
        <motion.div
          className="mt-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-start gap-5">
            {/* Icon */}
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-3xl">
              {categoryEmoji[project.category]}
            </div>

            <div className="min-w-0">
              {/* Category + Status */}
              <div className="mb-2 flex items-center gap-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/25">
                  {categoryLabel[project.category]}
                </span>
                <span
                  className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider"
                  style={{ color: status.color }}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: status.color }}
                  />
                  {status.text}
                </span>
              </div>

              {/* Title */}
              <h1 className="mb-2 text-4xl font-black tracking-tight md:text-5xl">
                {project.title}
              </h1>
              <p className="text-lg text-white/40">{project.subtitle}</p>
            </div>
          </div>

          {/* Meta row */}
          <div className="mt-6 flex flex-wrap items-center gap-6">
            {/* Rating */}
            <div className="flex items-center gap-2">
              <StarRating rating={Math.round(avgRating)} />
              <span className="text-sm text-white/40">{avgRating.toFixed(1)}</span>
            </div>

            {/* Platform */}
            <div className="flex gap-2">
              {project.platform.map((p) => (
                <span
                  key={p}
                  className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/30"
                >
                  {p}
                </span>
              ))}
            </div>

            {/* Date */}
            <span className="text-xs text-white/15">
              Updated {project.updatedAt}
            </span>
          </div>

          {/* Tags */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/[0.08] px-3 py-1 text-xs text-white/30"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Links */}
          <div className="mt-6 flex flex-wrap gap-3">
            {project.links.web && (
              <a
                href={project.links.web}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition-transform hover:scale-105"
              >
                Open App →
              </a>
            )}
            {project.links.github && (
              <a
                href={project.links.github}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white/60 transition-colors hover:border-white/40 hover:text-white"
              >
                GitHub
              </a>
            )}
            {project.links.appStore && (
              <a
                href={project.links.appStore}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white/60 transition-colors hover:border-white/40 hover:text-white"
              >
                App Store
              </a>
            )}
            {project.links.playStore && (
              <a
                href={project.links.playStore}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white/60 transition-colors hover:border-white/40 hover:text-white"
              >
                Google Play
              </a>
            )}
            {project.links.download && (
              token ? (
                <button
                  onClick={handleDownload}
                  disabled={downloadLoading}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white/60 transition-colors hover:border-white/40 hover:text-white disabled:opacity-50"
                >
                  {downloadLoading ? 'Preparing...' : 'Download'}
                </button>
              ) : (
                <Link
                  to="/auth"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white/60 transition-colors hover:border-white/40 hover:text-white"
                >
                  Download (Login required)
                </Link>
              )
            )}
          </div>
        </motion.div>

        {/* Divider */}
        <div className="my-10 h-px bg-white/[0.06]" />

        {/* Tabs */}
        <div className="mb-8 flex gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative rounded-lg px-5 py-2.5 text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-white/10 text-white'
                  : 'text-white/30 hover:text-white/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'about' && (
              <div className="selectable prose prose-invert max-w-none prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-p:text-white/50 prose-li:text-white/50 prose-strong:text-white/70">
                <Markdown>{project.description}</Markdown>
              </div>
            )}

            {activeTab === 'howto' && (
              <div className="selectable prose prose-invert max-w-none prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-p:text-white/50 prose-li:text-white/50 prose-strong:text-white/70">
                <Markdown>{project.howToUse}</Markdown>
              </div>
            )}

            {activeTab === 'reviews' && (
              <div>
                {/* Review summary */}
                <div className="mb-8 flex items-center gap-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
                  <div className="text-center">
                    <div className="text-4xl font-black">{avgRating.toFixed(1)}</div>
                    <StarRating rating={Math.round(avgRating)} />
                    <div className="mt-1 text-xs text-white/20">{reviews.length} reviews</div>
                  </div>
                  <div className="h-16 w-px bg-white/[0.06]" />
                  {/* Review form or login prompt */}
                  <div className="flex-1">
                    {user && token ? (
                      <div className="space-y-3">
                        <div>
                          <div className="mb-1 text-xs text-white/30">評価</div>
                          <InteractiveStarRating rating={newRating} onChange={setNewRating} />
                        </div>
                        <textarea
                          value={newContent}
                          onChange={(e) => setNewContent(e.target.value)}
                          placeholder="レビューを書く..."
                          rows={2}
                          className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white/70 placeholder-white/20 outline-none transition-colors focus:border-white/20"
                        />
                        <button
                          onClick={handleSubmitReview}
                          disabled={submitting || newRating === 0 || !newContent.trim()}
                          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          {submitting ? '送信中...' : '投稿する'}
                        </button>
                      </div>
                    ) : (
                      <Link
                        to="/auth"
                        className="text-sm text-white/40 underline transition-colors hover:text-white/60"
                      >
                        ログインしてレビューを投稿
                      </Link>
                    )}
                  </div>
                </div>

                {/* Review list */}
                <div className="space-y-4">
                  {reviews.map((review, i) => (
                    <motion.div
                      key={review.id}
                      className="selectable rounded-xl border border-white/[0.06] bg-white/[0.02] p-5"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.08 }}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white/50">
                            {review.userName[0].toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-white/60">{review.userName}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {user && user.userId === review.userId && editingId !== review.id && (
                            <>
                              <button
                                onClick={() => handleStartEdit(review)}
                                className="text-xs text-white/20 transition-colors hover:text-white/50"
                              >
                                編集
                              </button>
                              <button
                                onClick={() => handleDeleteReview(review.id)}
                                className="text-xs text-white/20 transition-colors hover:text-red-400/70"
                              >
                                削除
                              </button>
                            </>
                          )}
                          <span className="text-xs text-white/15">{review.createdAt}</span>
                        </div>
                      </div>

                      {editingId === review.id ? (
                        <div className="space-y-3">
                          <InteractiveStarRating rating={editRating} onChange={setEditRating} />
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            rows={3}
                            className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white/70 placeholder-white/20 outline-none transition-colors focus:border-white/20"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveEdit(review.id)}
                              disabled={editSubmitting || editRating === 0 || !editContent.trim()}
                              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              {editSubmitting ? '保存中...' : '保存'}
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="rounded-lg px-3 py-1.5 text-xs text-white/30 transition-colors hover:text-white/50"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <StarRating rating={Math.round(review.rating)} />
                          <p className="mt-3 text-sm leading-relaxed text-white/40">{review.content}</p>
                        </>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
