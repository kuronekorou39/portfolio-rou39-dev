import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { categoryLabel, categoryEmoji, statusLabel } from '@/data/mockProjects';
import { fetchProjects, fetchPageView } from '@/lib/api';
import type { Project, ProjectCategory } from '../../../shared/src/types';

const categories: { key: 'all' | ProjectCategory; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'web', label: 'Web' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'extension', label: 'Extension' },
  { key: 'tool', label: 'Tool' },
];

export default function AppsPage() {
  const [filter, setFilter] = useState<'all' | ProjectCategory>('all');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewCounts, setViewCounts] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    fetchProjects()
      .then((data) => {
        setProjects(data);
        // Fetch view counts for all projects
        Promise.all(
          data.map((p) =>
            fetchPageView(p.id)
              .then((res) => [p.id, res.count] as const)
              .catch(() => [p.id, 0] as const)
          )
        ).then((results) => {
          setViewCounts(new Map(results));
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const sizeOrder: Record<string, number> = { large: 0, medium: 1, small: 2 };
  const statusOrder: Record<string, number> = {
    active: 0,
    development: 1,
    'coming-soon': 2,
    archived: 3,
  };

  const filtered = (
    filter === 'all'
      ? projects
      : projects.filter((p) => p.category === filter)
  ).sort((a, b) => {
    const sizeDiff = (sizeOrder[a.size] ?? 1) - (sizeOrder[b.size] ?? 1);
    if (sizeDiff !== 0) return sizeDiff;
    return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
  });

  return (
    <div className="min-h-screen bg-[#060608] text-white">
      <div className="mx-auto max-w-6xl px-6 py-20">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="mb-3 text-5xl font-black tracking-tight md:text-6xl">
            Apps
          </h1>
          <p className="mb-10 text-lg text-white/30">
            開発したアプリケーション一覧
          </p>
        </motion.div>

        {/* Filter tabs */}
        <motion.div
          className="mb-12 flex flex-wrap gap-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setFilter(cat.key)}
              className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${
                filter === cat.key
                  ? 'bg-white text-black'
                  : 'border border-white/10 text-white/40 hover:border-white/30 hover:text-white/70'
              }`}
            >
              {cat.label}
            </button>
          ))}
          <span className="flex items-center px-3 text-xs text-white/20">
            {filtered.length} projects
          </span>
        </motion.div>

        {/* Grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
          </div>
        ) : (
        <motion.div
          layout
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          <AnimatePresence mode="popLayout">
            {filtered.map((project, i) => {
              const status = statusLabel[project.status];
              const isComingSoon = project.status === 'coming-soon';
              const size = project.size || 'medium';
              const isLarge = size === 'large';
              const isSmall = size === 'small';
              const screenshot = project.screenshots?.[0];

              return (
                <motion.div
                  key={project.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                  className={isLarge ? 'sm:col-span-2' : ''}
                >
                  <Link
                    to={`/apps/${project.id}`}
                    className={`group relative block h-full overflow-hidden rounded-2xl transition-all hover:bg-white/[0.04] ${
                      isComingSoon
                        ? 'border border-dashed border-blue-400/20 bg-blue-400/[0.02] hover:border-blue-400/40'
                        : 'border border-white/[0.06] bg-white/[0.02] hover:border-white/20'
                    } ${isSmall ? 'p-4' : 'p-6'}`}
                  >
                    {/* Large: horizontal layout with screenshot */}
                    {isLarge ? (
                      <div className="flex gap-6">
                        {/* Screenshot area */}
                        <div className="hidden w-2/5 shrink-0 overflow-hidden rounded-xl bg-white/[0.03] sm:block">
                          {screenshot ? (
                            <img src={screenshot} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full min-h-[160px] items-center justify-center text-4xl opacity-20">
                              {categoryEmoji[project.category]}
                            </div>
                          )}
                        </div>
                        {/* Content */}
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{categoryEmoji[project.category]}</span>
                              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/25">
                                {categoryLabel[project.category]}
                              </span>
                            </div>
                            <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider" style={{ color: status.color }}>
                              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: status.color }} />
                              {status.text}
                            </span>
                          </div>
                          <h2 className="mb-1.5 text-2xl font-bold text-white/80 transition-colors group-hover:text-white">
                            {project.title}
                          </h2>
                          <p className="mb-4 text-sm text-white/30 transition-colors group-hover:text-white/45">
                            {project.subtitle}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {project.tags.slice(0, 5).map((tag) => (
                              <span key={tag} className="rounded-full border border-white/[0.06] px-2.5 py-0.5 text-[11px] text-white/25">
                                {tag}
                              </span>
                            ))}
                            {project.tags.length > 5 && (
                              <span className="px-1 text-[11px] text-white/15">+{project.tags.length - 5}</span>
                            )}
                          </div>
                          <div className="mt-auto flex items-center gap-2 pt-4">
                            {project.platform.map((p) => (
                              <span key={p} className="text-[10px] font-medium uppercase tracking-wider text-white/15">{p}</span>
                            ))}
                            <span className="ml-auto flex items-center gap-1 text-[10px] text-white/15">
                              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              {viewCounts.get(project.id)?.toLocaleString() ?? '0'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Medium / Small: vertical layout */}
                        <div className={`flex items-center justify-between ${isSmall ? 'mb-3' : 'mb-5'}`}>
                          <div className="flex items-center gap-3">
                            <span className={isSmall ? 'text-lg' : 'text-2xl'}>
                              {categoryEmoji[project.category]}
                            </span>
                            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/25">
                              {categoryLabel[project.category]}
                            </span>
                          </div>
                          <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider" style={{ color: status.color }}>
                            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: status.color }} />
                            {status.text}
                          </span>
                        </div>

                        <h2 className={`mb-1.5 font-bold text-white/80 transition-colors group-hover:text-white ${isSmall ? 'text-base' : 'text-xl'}`}>
                          {project.title}
                        </h2>
                        <p className={`text-sm text-white/30 transition-colors group-hover:text-white/45 ${isSmall ? 'mb-3' : 'mb-5'}`}>
                          {project.subtitle}
                        </p>

                        {/* Tags — hidden for small */}
                        {!isSmall && (
                          <div className="flex flex-wrap gap-1.5">
                            {project.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="rounded-full border border-white/[0.06] px-2.5 py-0.5 text-[11px] text-white/25">
                                {tag}
                              </span>
                            ))}
                            {project.tags.length > 3 && (
                              <span className="px-1 text-[11px] text-white/15">+{project.tags.length - 3}</span>
                            )}
                          </div>
                        )}

                        <div className={`flex items-center gap-2 ${isSmall ? '' : 'mt-4'}`}>
                          {project.platform.map((p) => (
                            <span key={p} className="text-[10px] font-medium uppercase tracking-wider text-white/15">{p}</span>
                          ))}
                          <span className="ml-auto flex items-center gap-1 text-[10px] text-white/15">
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            {viewCounts.get(project.id)?.toLocaleString() ?? '0'}
                          </span>
                        </div>
                      </>
                    )}

                    {/* Hover arrow */}
                    <div className={`absolute text-white/0 transition-all group-hover:text-white/30 ${isSmall ? 'bottom-4 right-4' : 'bottom-6 right-6'}`}>
                      →
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
        )}
      </div>
    </div>
  );
}
