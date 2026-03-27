import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { categoryLabel, categoryEmoji, statusLabel } from '@/data/mockProjects';
import { fetchProjects } from '@/lib/api';
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

  useEffect(() => {
    fetchProjects()
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    filter === 'all'
      ? projects
      : projects.filter((p) => p.category === filter);

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
              return (
                <motion.div
                  key={project.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                >
                  <Link
                    to={`/apps/${project.id}`}
                    className="group relative block overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all hover:border-white/20 hover:bg-white/[0.04]"
                  >
                    {/* Top row: emoji + category + status */}
                    <div className="mb-5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">
                          {categoryEmoji[project.category]}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/25">
                          {categoryLabel[project.category]}
                        </span>
                      </div>
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

                    {/* Title + subtitle */}
                    <h2 className="mb-1.5 text-xl font-bold text-white/80 transition-colors group-hover:text-white">
                      {project.title}
                    </h2>
                    <p className="mb-5 text-sm text-white/30 transition-colors group-hover:text-white/45">
                      {project.subtitle}
                    </p>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5">
                      {project.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-white/[0.06] px-2.5 py-0.5 text-[11px] text-white/25"
                        >
                          {tag}
                        </span>
                      ))}
                      {project.tags.length > 3 && (
                        <span className="px-1 text-[11px] text-white/15">
                          +{project.tags.length - 3}
                        </span>
                      )}
                    </div>

                    {/* Platform badges */}
                    <div className="mt-4 flex gap-2">
                      {project.platform.map((p) => (
                        <span
                          key={p}
                          className="text-[10px] font-medium uppercase tracking-wider text-white/15"
                        >
                          {p}
                        </span>
                      ))}
                    </div>

                    {/* Hover arrow */}
                    <div className="absolute bottom-6 right-6 text-white/0 transition-all group-hover:text-white/30">
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
