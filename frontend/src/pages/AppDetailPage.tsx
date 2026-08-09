import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useOutletContext } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Markdown from 'react-markdown';
import { categoryLabel, categoryEmoji, statusLabel } from '@/data/mockProjects';
import { fetchProject, fetchReviews, createReview, updateReview, deleteReview, incrementPageView, fetchPageView, fetchInterest, addInterest, removeInterest, fetchComments, createComment, deleteComment, fetchReplies, createReply } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { getAvatarEmoji } from '@/lib/avatars';
import type { Project, Review, Comment as ProjectComment } from '../../../shared/src/types';

type Tab = 'about' | 'howto' | 'reviews' | 'feedback';

const GitHubIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
);

const ExternalLinkIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
);

const DownloadIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
);

const AppleIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
);

const PlayStoreIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M3.61 1.84 13.8 12 3.61 22.16a1.7 1.7 0 0 1-.6-1.3V3.14c0-.52.24-.99.6-1.3zm11.4 11.32 2.53 2.53-11.2 6.4 8.67-8.93zM20.6 10.4c.86.48.86 1.72 0 2.2l-2.72 1.55L15.1 12l2.78-2.15 2.72 1.55zM6.34 1.11l11.2 6.4-2.53 2.53L6.34 1.1z"/></svg>
);

function detectOS(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('linux')) return 'linux';
  if (ua.includes('android')) return 'android';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
  return 'other';
}

import type { DownloadEntry } from '../../../shared/src/types';

function dlUrl(projectId: string, os?: string): string {
  return `/api/downloads/${projectId}${os ? `?os=${os}` : ''}`;
}

function DownloadButton({ projectId, downloads, compact = false }: { projectId: string; downloads: DownloadEntry[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const userOS = detectOS();
  // os は `mac-arm` のようにサフィックスが付くことがある。同一OSに複数の配布形式が
  // あるときは先頭の1件だけを推奨として出す(ブラウザからCPUの種別までは判別できない)
  const recommendedIndex = downloads.findIndex(
    dl => dl.os === userOS || dl.os.startsWith(`${userOS}-`)
  );

  if (downloads.length === 1) {
    return (
      <a
        href={dlUrl(projectId, downloads[0].os)}
        className={`flex items-center justify-center gap-1.5 rounded-xl bg-white font-semibold text-black ${compact ? 'flex-1 py-2.5 text-xs' : 'py-2.5 text-sm'}`}
      >
        <DownloadIcon size={compact ? 12 : 14} /> Download
      </a>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex w-full items-center justify-center gap-1.5 rounded-xl bg-white font-semibold text-black ${compact ? 'py-2.5 text-xs' : 'py-2.5 text-sm'}`}
      >
        <DownloadIcon size={compact ? 12 : 14} /> Download ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-white/10 bg-[#161b22] shadow-xl">
            {downloads.map((dl, i) => {
              const isRecommended = i === recommendedIndex;
              return (
                <a
                  key={i}
                  href={dlUrl(projectId, dl.os)}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-xs transition-colors hover:bg-white/10 ${
                    isRecommended ? 'bg-white/[0.04] text-white' : 'text-white/50'
                  }`}
                >
                  <DownloadIcon size={12} />
                  <span className="flex-1">{dl.label}</span>
                  {isRecommended && (
                    <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-medium text-blue-400">推奨</span>
                  )}
                </a>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [viewCount, setViewCount] = useState<number>(0);
  const [downloadCount, setDownloadCount] = useState<number>(0);

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

  // Comment state
  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  // Thread (reply) state
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [threadReplies, setThreadReplies] = useState<Record<string, ProjectComment[]>>({});
  const [threadLoading, setThreadLoading] = useState<Set<string>>(new Set());
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [replySubmitting, setReplySubmitting] = useState<Set<string>>(new Set());

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
        // Always load comments, interests & reviews
        reloadComments();
        reloadInterest();
        reloadReviews();
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
    incrementPageView(id).catch(console.error);
    fetchPageView(id)
      .then((data) => {
        setViewCount(data.count);
        setDownloadCount(data.downloadCount);
      })
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

  const handleToggleThread = async (commentId: string) => {
    if (expandedThreads.has(commentId)) {
      setExpandedThreads((prev) => {
        const next = new Set(prev);
        next.delete(commentId);
        return next;
      });
      return;
    }
    // Expand and load replies
    setExpandedThreads((prev) => new Set(prev).add(commentId));
    if (!threadReplies[commentId]) {
      await loadReplies(commentId);
    }
  };

  const loadReplies = async (commentId: string) => {
    if (!id) return;
    setThreadLoading((prev) => new Set(prev).add(commentId));
    try {
      const replies = await fetchReplies(id, commentId);
      setThreadReplies((prev) => ({ ...prev, [commentId]: replies }));
    } catch (err) {
      console.error(err);
    } finally {
      setThreadLoading((prev) => {
        const next = new Set(prev);
        next.delete(commentId);
        return next;
      });
    }
  };

  const handleSubmitReply = async (commentId: string) => {
    if (!id || !token) return;
    const text = (replyTexts[commentId] ?? '').trim();
    if (!text) return;
    setReplySubmitting((prev) => new Set(prev).add(commentId));
    try {
      await createReply(id, commentId, { content: text }, token);
      setReplyTexts((prev) => ({ ...prev, [commentId]: '' }));
      await loadReplies(commentId);
      reloadComments(); // update replyCount
    } catch (err) {
      console.error(err);
    } finally {
      setReplySubmitting((prev) => {
        const next = new Set(prev);
        next.delete(commentId);
        return next;
      });
    }
  };

  const handleDeleteReply = async (commentId: string, replyId: string) => {
    if (!id || !token) return;
    try {
      await deleteComment(id, replyId, token);
      await loadReplies(commentId);
      reloadComments(); // update replyCount
    } catch (err) {
      console.error(err);
    }
  };

  // Lightbox keyboard navigation
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKey = (e: KeyboardEvent) => {
      const total = project?.screenshots?.length ?? 0;
      if (e.key === 'Escape') setLightboxIndex(null);
      else if (e.key === 'ArrowRight') setLightboxIndex((prev) => (prev !== null && prev < total - 1 ? prev + 1 : prev));
      else if (e.key === 'ArrowLeft') setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxIndex, project?.screenshots?.length]);

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
        { key: 'feedback', label: 'Feedback' },
      ]
    : [
        { key: 'about', label: 'About' },
        { key: 'howto', label: 'How to Use' },
        { key: 'reviews', label: 'Reviews' },
        ...(comments.length > 0 ? [{ key: 'feedback' as Tab, label: 'Feedback' }] : []),
      ];

  return (
    <div className="min-h-screen bg-[#060608] text-white">
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-12">
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

        {/* Two-column layout */}
        <motion.div
          className="mt-4 flex flex-col gap-6 sm:mt-8 sm:gap-8 lg:flex-row"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* ===== Left column: main content ===== */}
          <div className="min-w-0 flex-1">
            {/* Title + meta (mobile/tablet only — desktop shows in sidebar) */}
            <div className="mb-4 lg:hidden">
              <div className="flex items-start gap-3">
                {project.icon ? (
                  <img src={project.icon} alt="" className="h-10 w-10 shrink-0 rounded-full border border-white/10 object-cover" loading="lazy" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-xl">
                    {categoryEmoji[project.category]}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl font-black tracking-tight">{project.title}</h1>
                  <p className="text-xs text-white/40">{project.subtitle}</p>
                </div>
                {/* Rating + views — top right */}
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {!isComingSoon && reviews.length > 0 && (
                    <div className="flex items-center gap-1">
                      <StarRating rating={avgRating} />
                      <span className="text-[10px] text-white/30">{avgRating.toFixed(1)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-[10px] text-white/20">
                    <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    {viewCount.toLocaleString()}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-white/20">
                    {project.platform.map((p) => (
                      <span key={p} className="rounded bg-white/[0.06] px-1.5 py-0.5">{p}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Screenshots gallery */}
            {project.screenshots && project.screenshots.length > 0 && (
              <div className="mb-6">
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {project.screenshots.map((src, i) => (
                    <button
                      key={i}
                      onClick={() => setLightboxIndex(i)}
                      className="shrink-0 cursor-pointer overflow-hidden rounded-xl border border-white/[0.06] transition-all hover:border-white/20"
                    >
                      <img
                        src={src}
                        alt={`${project.title} screenshot ${i + 1}`}
                        className="h-44 w-auto object-cover sm:h-52"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Mobile: action buttons + meta (hidden on desktop) */}
            <div className="mb-4 lg:hidden">
              {/* Action buttons */}
              {!isComingSoon && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {project.links.web && (
                    <a href={project.links.web} target="_blank" rel="noopener noreferrer"
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-xs font-semibold text-black">
                      <ExternalLinkIcon size={12} /> Open App
                    </a>
                  )}
                  {/* ストアはモバイルでの主な導線なので、APK 等の直接ダウンロードより先に置く */}
                  {project.links.appStore && (
                    <a href={project.links.appStore} target="_blank" rel="noopener noreferrer"
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-xs font-semibold text-black">
                      <AppleIcon size={12} /> App Store
                    </a>
                  )}
                  {project.links.playStore && (
                    <a href={project.links.playStore} target="_blank" rel="noopener noreferrer"
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-xs font-semibold text-black">
                      <PlayStoreIcon size={12} /> Google Play
                    </a>
                  )}
                  {project.downloads && project.downloads.length > 0 && (
                    <div className="flex-1">
                      <DownloadButton projectId={project.id} downloads={project.downloads} compact />
                    </div>
                  )}
                  {!project.downloads?.length && project.links.download && (
                    <a href={project.links.download} target="_blank" rel="noopener noreferrer"
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-xs font-semibold text-black">
                      <DownloadIcon size={12} /> Download
                    </a>
                  )}
                  {project.links.github && (
                    <a href={project.links.github} target="_blank" rel="noopener noreferrer"
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/20 py-2.5 text-xs font-medium text-white/60 transition-colors hover:border-white/40 hover:text-white">
                      <GitHubIcon size={12} /> GitHub
                    </a>
                  )}
                </div>
              )}
              {isComingSoon && (
                <button
                  onClick={user && token ? handleToggleInterest : openAuth}
                  disabled={interestLoading}
                  className={`mb-3 w-full rounded-lg py-2 text-xs font-medium transition-all ${
                    isInterested
                      ? 'border border-blue-400/30 bg-blue-400/10 text-blue-400'
                      : 'border border-white/10 text-white/40'
                  }`}
                >
                  {isInterested ? '★' : '☆'} 興味あり {interestCount > 0 && `(${interestCount})`}
                </button>
              )}
            </div>

            {/* Tabs */}
            <div className="mb-6 flex gap-1 overflow-x-auto border-b border-white/[0.06]">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative shrink-0 px-3 py-2 text-xs font-medium transition-all sm:px-4 sm:py-2.5 sm:text-sm ${
                    activeTab === tab.key
                      ? 'text-white'
                      : 'text-white/30 hover:text-white/50'
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.key && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-blue-400" />
                  )}
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
              <div className="selectable md-content">
                <Markdown>{project.description}</Markdown>
              </div>
            )}

            {activeTab === 'howto' && (
              <div className="selectable md-content">
                <Markdown>{project.howToUse}</Markdown>
              </div>
            )}

            {activeTab === 'feedback' && (
              <div>
                {/* Comment form */}
                <div className="mb-8 rounded-xl border-l-2 border-blue-400/30 bg-white/[0.02] p-4 sm:p-6">
                  {user && token ? (
                    <div className="space-y-3">
                      <p className="text-sm text-white/40">
                        忌憚ない意見をお待ちしています。匿名なので、思ったことを自由にどうぞ。バグ報告、改善案、要望、感想、何でもOK。
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

                {/* Comment list */}
                <div className="space-y-4">
                  {comments.length === 0 && (
                    <p className="py-8 text-center text-sm text-white/20">
                      まだフィードバックはありません。最初の一言を！
                    </p>
                  )}
                  {comments.map((comment, i) => {
                    const replyCount = comment.replyCount ?? 0;
                    const isThreadOpen = expandedThreads.has(comment.id);
                    const replies = threadReplies[comment.id] ?? [];
                    const isLoadingReplies = threadLoading.has(comment.id);
                    const replyText = replyTexts[comment.id] ?? '';
                    const isSubmittingReply = replySubmitting.has(comment.id);

                    return (
                      <motion.div
                        key={comment.id}
                        className="selectable rounded-xl border border-white/[0.06] bg-white/[0.02] p-5"
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.08 }}
                      >
                        {/* Comment header */}
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

                        {/* Comment body */}
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/40">
                          {comment.content}
                        </p>

                        {/* Thread toggle button */}
                        <div className="mt-3">
                          <button
                            onClick={() => handleToggleThread(comment.id)}
                            className="inline-flex items-center gap-1.5 text-xs text-white/30 transition-colors hover:text-white/50"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                            {isThreadOpen ? '返信を閉じる' : `返信 ${replyCount}件`}
                          </button>
                        </div>

                        {/* Thread (replies) */}
                        <AnimatePresence>
                          {isThreadOpen && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-4 border-l-2 border-white/[0.06] pl-4">
                                {/* Loading spinner */}
                                {isLoadingReplies && (
                                  <div className="flex justify-center py-4">
                                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
                                  </div>
                                )}

                                {/* Reply list */}
                                {!isLoadingReplies && replies.length === 0 && (
                                  <p className="py-3 text-xs text-white/20">まだ返信はありません</p>
                                )}
                                {!isLoadingReplies && replies.map((reply) => (
                                  <motion.div
                                    key={reply.id}
                                    className="mb-3 rounded-lg border border-white/[0.04] bg-white/[0.015] p-3"
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                  >
                                    <div className="mb-1.5 flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs">
                                          {reply.userAvatar ? getAvatarEmoji(reply.userAvatar) : reply.userName[0].toUpperCase()}
                                        </div>
                                        <span className="text-xs font-medium text-white/50">{reply.userName}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {user && user.userId === reply.userId && (
                                          <button
                                            onClick={() => handleDeleteReply(comment.id, reply.id)}
                                            className="text-red-400/40 transition-colors hover:text-red-400"
                                            title="削除"
                                          >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                          </button>
                                        )}
                                        <span className="text-[10px] text-white/15">{formatDateTime(reply.createdAt)}</span>
                                      </div>
                                    </div>
                                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-white/40">
                                      {reply.content}
                                    </p>
                                  </motion.div>
                                ))}

                                {/* Reply input */}
                                {user && token ? (
                                  <div className="mt-3 flex gap-2">
                                    <input
                                      type="text"
                                      value={replyText}
                                      onChange={(e) =>
                                        setReplyTexts((prev) => ({ ...prev, [comment.id]: e.target.value }))
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                          e.preventDefault();
                                          handleSubmitReply(comment.id);
                                        }
                                      }}
                                      placeholder="返信を入力..."
                                      maxLength={500}
                                      className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 placeholder-white/20 outline-none transition-colors focus:border-white/20"
                                    />
                                    <button
                                      onClick={() => handleSubmitReply(comment.id)}
                                      disabled={isSubmittingReply || !replyText.trim()}
                                      className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
                                    >
                                      {isSubmittingReply ? '...' : '送信'}
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={openAuth}
                                    className="mt-2 text-xs text-white/30 underline transition-colors hover:text-white/50"
                                  >
                                    ログインして返信
                                  </button>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'reviews' && (
              <div>
                {/* Review summary */}
                <div className="mb-8 flex items-center gap-6 rounded-xl border-l-2 border-blue-400/30 bg-white/[0.02] p-4 sm:p-6">
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

          {/* ===== Right column: sidebar (desktop only) ===== */}
          <div className="hidden w-72 shrink-0 lg:block">
            <div className="sticky top-20 space-y-5">
              {/* Title (desktop only) */}
              <div className="hidden lg:block">
                <div className="mb-3 flex items-center gap-3">
                  {project.icon ? (
                    <img src={project.icon} alt="" className="h-12 w-12 rounded-full border border-white/10 object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-2xl">
                      {categoryEmoji[project.category]}
                    </span>
                  )}
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/25">
                      {categoryLabel[project.category]}
                    </span>
                    <span
                      className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider"
                      style={{ color: status.color }}
                    >
                      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: status.color }} />
                      {status.text}
                    </span>
                  </div>
                </div>
                <h1 className="mb-1 text-2xl font-black tracking-tight">{project.title}</h1>
                <p className="text-sm text-white/40">{project.subtitle}</p>
              </div>

              {/* Action buttons */}
              {!isComingSoon && (
                <div className="flex flex-col gap-2">
                  {project.links.web && (
                    <a href={project.links.web} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-semibold text-black transition-transform hover:scale-[1.02]">
                      <ExternalLinkIcon size={14} /> Open App
                    </a>
                  )}
                  {/* ストアはインストール導線なので、GitHub より上・ダウンロードと同じ扱いにする */}
                  {project.links.appStore && (
                    <a href={project.links.appStore} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-semibold text-black transition-transform hover:scale-[1.02]">
                      <AppleIcon /> App Store
                    </a>
                  )}
                  {project.links.playStore && (
                    <a href={project.links.playStore} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-semibold text-black transition-transform hover:scale-[1.02]">
                      <PlayStoreIcon /> Google Play
                    </a>
                  )}
                  {project.downloads && project.downloads.length > 0 && (
                    <DownloadButton projectId={project.id} downloads={project.downloads} />
                  )}
                  {!project.downloads?.length && project.links.download && (
                    <a href={project.links.download} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-semibold text-black">
                      <DownloadIcon /> Download
                    </a>
                  )}
                  {project.links.github && (
                    <a href={project.links.github} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 rounded-xl border border-white/20 py-2.5 text-sm font-medium text-white/60 transition-colors hover:border-white/40 hover:text-white">
                      <GitHubIcon /> GitHub
                    </a>
                  )}
                </div>
              )}

              {/* Interest button (coming-soon) */}
              {isComingSoon && (
                <button
                  onClick={user && token ? handleToggleInterest : openAuth}
                  disabled={interestLoading}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-all ${
                    isInterested
                      ? 'border border-blue-400/30 bg-blue-400/10 text-blue-400'
                      : 'border border-white/10 text-white/40 hover:border-white/30 hover:text-white/60'
                  }`}
                >
                  {isInterested ? '★' : '☆'} 興味あり {interestCount > 0 && `(${interestCount})`}
                </button>
              )}

              {/* Info card */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="space-y-3 text-xs">
                  {/* Rating */}
                  {!isComingSoon && reviews.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-white/30">Rating</span>
                      <div className="flex items-center gap-1.5">
                        <StarRating rating={avgRating} />
                        <span className="text-white/50">{avgRating.toFixed(1)}</span>
                      </div>
                    </div>
                  )}
                  {interestCount > 0 && !isComingSoon && (
                    <div className="flex items-center justify-between">
                      <span className="text-white/30">Interested</span>
                      <span className="text-blue-400/60">{interestCount}人</span>
                    </div>
                  )}
                  {/* Platform */}
                  <div className="flex items-center justify-between">
                    <span className="text-white/30">Platform</span>
                    <div className="flex gap-1.5">
                      {project.platform.map((p) => (
                        <span key={p} className="rounded bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/40">{p}</span>
                      ))}
                    </div>
                  </div>
                  {/* Views & Downloads */}
                  <div className="flex items-center justify-between">
                    <span className="text-white/30">Views</span>
                    <span className="text-white/40">{viewCount.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/30">Downloads</span>
                    <span className="text-white/40">{downloadCount > 0 ? downloadCount.toLocaleString() : '-'}</span>
                  </div>
                  {/* Updated */}
                  <div className="flex items-center justify-between">
                    <span className="text-white/30">Updated</span>
                    <span className="text-white/40">{project.updatedAt}</span>
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/20">Tech Stack</div>
                <div className="flex flex-wrap gap-1.5">
                  {project.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[11px] text-white/30">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Screenshot lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && project?.screenshots && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxIndex(null)}
          >
            {/* Close button */}
            <button
              className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white/60 transition-colors hover:bg-white/20 hover:text-white"
              onClick={() => setLightboxIndex(null)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>

            {/* Prev button */}
            {lightboxIndex > 0 && (
              <button
                className="absolute left-4 z-10 rounded-full bg-white/10 p-3 text-white/60 transition-colors hover:bg-white/20 hover:text-white"
                onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
            )}

            {/* Image */}
            <motion.img
              key={lightboxIndex}
              src={project.screenshots[lightboxIndex]}
              alt=""
              className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            />

            {/* Next button */}
            {lightboxIndex < project.screenshots.length - 1 && (
              <button
                className="absolute right-4 z-10 rounded-full bg-white/10 p-3 text-white/60 transition-colors hover:bg-white/20 hover:text-white"
                onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            )}

            {/* Counter */}
            <div className="absolute bottom-4 text-xs text-white/30">
              {lightboxIndex + 1} / {project.screenshots.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
