import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useOutletContext } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Markdown from 'react-markdown';
import { categoryLabel, categoryEmoji, statusLabel } from '@/data/mockProjects';
import { fetchProject, fetchReviews, createReview, updateReview, deleteReview, incrementPageView, fetchPageView, getDownloadUrl, fetchInterest, addInterest, removeInterest, fetchComments, createComment, deleteComment } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { getAvatarEmoji } from '@/lib/avatars';
import type { Project, Review, Comment as ProjectComment } from '../../../shared/src/types';

type Tab = 'about' | 'howto' | 'reviews' | 'feedback';

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = rating >= star;
        const half = !filled && rating >= star - 0.5;
        if (half) {
          return (
            <span key={star} className="relative inline-block text-sm">
              <span className="text-white/10">★</span>
              <span
                className="absolute left-0 top-0 text-yellow-400"
                style={{ clipPath: 'inset(0 50% 0 0)' }}
              >★</span>
            </span>
          );
        }
        return (
          <span key={star} className={`text-sm ${filled ? 'text-yellow-400' : 'text-white/10'}`}>★</span>
        );
      })}
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
  const active = hover || rating;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <div
          key={star}
          className="relative cursor-pointer text-xl"
          onMouseLeave={() => setHover(0)}
        >
          <span className="text-white/10">★</span>
          {active >= star - 0.5 && (
            <span
              className="pointer-events-none absolute inset-0 overflow-hidden text-yellow-400"
              style={{ width: active >= star ? '100%' : '50%' }}
            >
              ★
            </span>
          )}
          {/* Left half → X.5 (min 1.0) */}
          <span
            className="absolute inset-0 w-1/2"
            onMouseEnter={() => setHover(Math.max(1, star - 0.5))}
            onClick={() => onChange(Math.max(1, star - 0.5))}
          />
          {/* Right half → X.0 */}
          <span
            className="absolute inset-0 left-1/2 w-1/2"
            onMouseEnter={() => setHover(star)}
            onClick={() => onChange(star)}
          />
        </div>
      ))}
      {active > 0 && (
        <span className="ml-1 self-center text-xs text-white/30">{active.toFixed(1)}</span>
      )}
    </div>
  );
}

export default function AppDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuth();
  const { openAuth } = useOutletContext<{ openAuth: () => void }>();
  const [activeTab, setActiveTab] = useState<Tab>('about');
  const [project, setProject] = useState<Project | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [viewCount, setViewCount] = useState<number>(0);

  // Review form state
  const [newRating, setNewRating] = useState(0);
  const [newContent, setNewContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Review expand state
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set());

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRating, setEditRating] = useState(0);
  const [editContent, setEditContent] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Interest state (coming-soon)
  const [interestCount, setInterestCount] = useState(0);
  const [isInterested, setIsInterested] = useState(false);
  const [interestLoading, setInterestLoading] = useState(false);

  // Comment state (coming-soon)
  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const reloadReviews = useCallback(() => {
    if (!id) return;
    fetchReviews(id).then(setReviews).catch(console.error);
  }, [id]);

  const reloadComments = useCallback(() => {
    if (!id) return;
    fetchComments(id).then(setComments).catch(console.error);
  }, [id]);

  const reloadInterest = useCallback(() => {
    if (!id) return;
    fetchInterest(id, token ?? undefined)
      .then((data) => {
        setInterestCount(data.count);
        setIsInterested(data.interested);
      })
      .catch(console.error);
  }, [id, token]);

  useEffect(() => {
    if (!id) return;
    fetchProject(id)
      .then((p) => {
        setProject(p);
        // Always load comments & interests (they persist across status changes)
        reloadComments();
        reloadInterest();
        if (p.status !== 'coming-soon') {
          reloadReviews();
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
    incrementPageView(id).catch(console.error);
    fetchPageView(id)
      .then((data) => setViewCount(data.count))
      .catch(console.error);
  }, [id, reloadReviews, reloadComments, reloadInterest]);

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

  const handleToggleInterest = async () => {
    if (!id || !token) return;
    setInterestLoading(true);
    try {
      if (isInterested) {
        await removeInterest(id, token);
      } else {
        await addInterest(id, token);
      }
      reloadInterest();
    } catch (err) {
      console.error(err);
    } finally {
      setInterestLoading(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!id || !token || !newComment.trim()) return;
    setCommentSubmitting(true);
    try {
      await createComment(id, { content: newComment.trim() }, token);
      setNewComment('');
      reloadComments();
    } catch (err) {
      console.error(err);
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!id || !token) return;
    try {
      await deleteComment(id, commentId, token);
      reloadComments();
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

  const myReview = user ? reviews.find((r) => r.userId === user.userId) : null;

  const isComingSoon = project.status === 'coming-soon';

  const tabs: { key: Tab; label: string }[] = isComingSoon
    ? [
        { key: 'about', label: 'About' },
        { key: 'feedback', label: `Feedback (${comments.length})` },
      ]
    : [
        { key: 'about', label: 'About' },
        { key: 'howto', label: 'How to Use' },
        { key: 'reviews', label: `Reviews (${reviews.length})` },
        ...(comments.length > 0
          ? [{ key: 'feedback' as Tab, label: `Feedback (${comments.length})` }]
          : []),
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
            {/* Rating or Interest */}
            {isComingSoon ? (
              <button
                onClick={user && token ? handleToggleInterest : openAuth}
                disabled={interestLoading}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  isInterested
                    ? 'border border-blue-400/30 bg-blue-400/10 text-blue-400'
                    : 'border border-white/10 text-white/40 hover:border-white/30 hover:text-white/60'
                }`}
              >
                {isInterested ? '★' : '☆'} 興味あり {interestCount > 0 && `(${interestCount})`}
              </button>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <StarRating rating={avgRating} />
                  <span className="text-sm text-white/40">{avgRating.toFixed(1)}</span>
                </div>
                {interestCount > 0 && (
                  <span className="text-xs text-blue-400/50">
                    ★ {interestCount}人が注目
                  </span>
                )}
              </>
            )}

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

            {/* Views */}
            <div className="flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/25"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <span className="text-xs text-white/25">{viewCount.toLocaleString()}</span>
            </div>
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

          {/* Links (hidden for coming-soon) */}
          {!isComingSoon && <div className="mt-6 flex flex-wrap gap-3">
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
                <button
                  onClick={openAuth}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white/60 transition-colors hover:border-white/40 hover:text-white"
                >
                  Download (Login required)
                </button>
              )
            )}
          </div>}
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

            {activeTab === 'feedback' && (
              <div>
                {/* Comment form (only for coming-soon) */}
                {isComingSoon ? (
                <div className="mb-8 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
                  {user && token ? (
                    <div className="space-y-3">
                      <p className="text-sm text-white/40">
                        このアプリに対するフィードバックや要望を自由に書いてください
                      </p>
                      <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="期待してます！ / こんな機能がほしい / 気になる点..."
                        rows={3}
                        maxLength={500}
                        className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white/70 placeholder-white/20 outline-none transition-colors focus:border-white/20"
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/20">{newComment.length}/500</span>
                        <button
                          onClick={handleSubmitComment}
                          disabled={commentSubmitting || !newComment.trim()}
                          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          {commentSubmitting ? '送信中...' : '投稿する'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={openAuth}
                      className="text-sm text-white/40 underline transition-colors hover:text-white/60"
                    >
                      ログインしてフィードバックを投稿
                    </button>
                  )}
                </div>
                ) : (
                <div className="mb-8 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <p className="text-sm text-white/30">開発中に寄せられたフィードバック</p>
                </div>
                )}

                {/* Comment list */}
                <div className="space-y-4">
                  {comments.length === 0 && (
                    <p className="py-8 text-center text-sm text-white/20">
                      まだフィードバックはありません。最初の一言を！
                    </p>
                  )}
                  {comments.map((comment, i) => (
                    <motion.div
                      key={comment.id}
                      className="selectable rounded-xl border border-white/[0.06] bg-white/[0.02] p-5"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.08 }}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-base">
                            {comment.userAvatar ? getAvatarEmoji(comment.userAvatar) : comment.userName[0].toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-white/60">{comment.userName}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {user && user.userId === comment.userId && (
                            <button
                              onClick={() => handleDeleteComment(comment.id)}
                              className="text-red-400/40 transition-colors hover:text-red-400"
                              title="削除"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                          )}
                          <span className="text-xs text-white/15">{formatDateTime(comment.createdAt)}</span>
                        </div>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/40">
                        {comment.content}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'reviews' && (
              <div>
                {/* Review summary */}
                <div className="mb-8 flex items-center gap-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
                  <div className="text-center">
                    <div className="text-4xl font-black">{avgRating.toFixed(1)}</div>
                    <StarRating rating={avgRating} />
                    <div className="mt-1 text-xs text-white/20">{reviews.length} reviews</div>
                  </div>
                  <div className="h-16 w-px bg-white/[0.06]" />
                  {/* Review form or login prompt */}
                  <div className="flex-1">
                    {user && token ? (
                      myReview ? (
                        <p className="text-sm text-white/30">
                          レビュー投稿済みです（下の自分のレビューから編集できます）
                        </p>
                      ) : (
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
                            maxLength={500}
                            className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white/70 placeholder-white/20 outline-none transition-colors focus:border-white/20"
                          />
                          <div className="text-right text-xs text-white/20">
                            {newContent.length}/500
                          </div>
                          <button
                            onClick={handleSubmitReview}
                            disabled={submitting || newRating === 0 || !newContent.trim()}
                            className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            {submitting ? '送信中...' : '投稿する'}
                          </button>
                        </div>
                      )
                    ) : (
                      <button
                        onClick={openAuth}
                        className="text-sm text-white/40 underline transition-colors hover:text-white/60"
                      >
                        ログインしてレビューを投稿
                      </button>
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
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-base">
                            {review.userAvatar ? getAvatarEmoji(review.userAvatar) : review.userName[0].toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-white/60">{review.userName}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {user && user.userId === review.userId && editingId !== review.id && (
                            <>
                              <button
                                onClick={() => handleStartEdit(review)}
                                className="text-blue-400/40 transition-colors hover:text-blue-400"
                                title="編集"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              <button
                                onClick={() => handleDeleteReview(review.id)}
                                className="text-red-400/40 transition-colors hover:text-red-400"
                                title="削除"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                              </button>
                            </>
                          )}
                          <span className="text-xs text-white/15">{formatDateTime(review.createdAt)}</span>
                        </div>
                      </div>

                      {editingId === review.id ? (
                        <div className="space-y-3">
                          <InteractiveStarRating rating={editRating} onChange={setEditRating} />
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            rows={3}
                            maxLength={500}
                            className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white/70 placeholder-white/20 outline-none transition-colors focus:border-white/20"
                          />
                          <div className="text-right text-xs text-white/20">
                            {editContent.length}/500
                          </div>
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
                          <StarRating rating={review.rating} />
                          <div className="mt-3">
                            <p className={`text-sm leading-relaxed text-white/40 whitespace-pre-wrap ${
                              !expandedReviews.has(review.id) ? 'line-clamp-3' : ''
                            }`}>
                              {review.content}
                            </p>
                            {review.content.length > 100 && (
                              <button
                                onClick={() => setExpandedReviews(prev => {
                                  const next = new Set(prev);
                                  if (next.has(review.id)) next.delete(review.id);
                                  else next.add(review.id);
                                  return next;
                                })}
                                className="mt-1 text-xs text-white/30 hover:text-white/50"
                              >
                                {expandedReviews.has(review.id) ? '閉じる' : 'もっと見る'}
                              </button>
                            )}
                          </div>
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
