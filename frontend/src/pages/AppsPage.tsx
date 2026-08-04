import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { categoryLabel, categoryEmoji, statusLabel } from '@/data/mockProjects';
import { fetchProjects } from '@/lib/api';
import type { Project, ProjectCategory } from '../../../shared/src/types';

const categories: { key: 'all' | ProjectCategory; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'web', label: 'Web' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'desktop', label: 'Desktop' },
  { key: 'chrome-ext', label: 'Chrome Ext' },
  { key: 'burp-ext', label: 'Burp Ext' },
];

const sorts = [
  { key: 'updated', label: '更新順' },
  { key: 'new', label: '新着順' },
  { key: 'popular', label: '人気順' },
] as const;
type SortKey = (typeof sorts)[number]['key'];

const DEFAULT_SORT: SortKey = 'updated';
// タグフィルタに出す数。実データには30種以上あるので、よく使うものだけ出す
const TAG_FILTER_LIMIT = 10;
// updatedAt がこれ以内なら NEW バッジを出す
const NEW_BADGE_DAYS = 30;

// coming-soon と archived は、どのソートを選んでも後ろへ送る
const statusRank: Record<string, number> = {
  active: 0,
  development: 0,
  'coming-soon': 1,
  archived: 2,
};

// スクリーンショットが無いアプリのカバー色。id から決まるので、再訪しても同じ色になる
function coverStyle(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${h} 45% 24%), hsl(${(h + 60) % 360} 40% 12%))`;
}

function daysSince(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? (Date.now() - t) / 86_400_000 : Infinity;
}

// カード全体が <Link> なので、ストアはリンクにせず「配信中」の目印として置く
// (リンクの入れ子は不正な HTML になる)。実際のリンクは詳細ページにある
function StoreMarks({ links }: { links: Project['links'] }) {
  if (!links.appStore && !links.playStore) return null;
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-white/30">
      {links.appStore && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-label="App Store で配信中">
          <title>App Store で配信中</title>
          <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
        </svg>
      )}
      {links.playStore && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-label="Google Play で配信中">
          <title>Google Play で配信中</title>
          <path d="M3.61 1.84 13.8 12 3.61 22.16a1.7 1.7 0 0 1-.6-1.3V3.14c0-.52.24-.99.6-1.3zm11.4 11.32 2.53 2.53-11.2 6.4 8.67-8.93zM20.6 10.4c.86.48.86 1.72 0 2.2l-2.72 1.55L15.1 12l2.78-2.15 2.72 1.55zM6.34 1.11l11.2 6.4-2.53 2.53L6.34 1.1z" />
        </svg>
      )}
    </span>
  );
}

export default function AppsPage() {
  const [params, setParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // フィルタは URL に持たせる。共有したリンクとブラウザバックで状態が復元できる
  const filter = (params.get('cat') ?? 'all') as 'all' | ProjectCategory;
  const tagFilter = params.get('tag');
  const query = params.get('q') ?? '';
  const sort = sorts.find((s) => s.key === params.get('sort'))?.key ?? DEFAULT_SORT;

  // 検索欄だけは入力値をローカルに持つ。URL を直接 value にすると、
  // setSearchParams の反映が 1 テンポ遅れて日本語入力の変換が確定前に巻き戻る
  const [searchInput, setSearchInput] = useState(query);
  useEffect(() => {
    setSearchInput(query);
  }, [query]);

  // 既定値はクエリから消して URL を短く保つ。1文字ごとに履歴が増えないよう replace で書く
  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      const isDefault =
        !value || (key === 'cat' && value === 'all') || (key === 'sort' && value === DEFAULT_SORT);
      if (isDefault) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  }

  function handleSearch(value: string) {
    setSearchInput(value);
    updateParams({ q: value });
  }

  useEffect(() => {
    // 表示数・DL数は /projects のレスポンスに含まれる (アプリごとに引くと N+1 になる)
    fetchProjects()
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // タグの選択肢はデータから作る。手書きの固定リストは実データとずれていく
  const techTags = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of projects) for (const tag of p.tags) count.set(tag, (count.get(tag) ?? 0) + 1);
    const top = [...count.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TAG_FILTER_LIMIT)
      .map(([tag]) => tag);
    // URL で上位圏外のタグを指定されたときも、選択中のボタンは必ず出す
    return tagFilter && !top.includes(tagFilter) ? [...top, tagFilter] : top;
  }, [projects, tagFilter]);

  const visible = useMemo(() => {
    // 絞り込みは入力値で即座にかける (URL への反映を待たない)
    const q = searchInput.trim().toLowerCase();
    const matched = projects.filter((p) => {
      if (filter !== 'all' && p.category !== filter) return false;
      if (tagFilter && !p.tags.includes(tagFilter)) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.subtitle.toLowerCase().includes(q) ||
        p.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });

    // 最後に id で比較して並びを固定する。これが無いと DynamoDB の Scan が返した順に
    // 引きずられて、デプロイのたびに一覧の順番が変わってしまう
    return matched.sort((a, b) => {
      const rank = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
      if (rank !== 0) return rank;
      let diff = 0;
      if (sort === 'popular') diff = (b.viewCount ?? 0) - (a.viewCount ?? 0);
      else if (sort === 'new') diff = b.publishedAt.localeCompare(a.publishedAt);
      else diff = b.updatedAt.localeCompare(a.updatedAt);
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    });
  }, [projects, filter, tagFilter, searchInput, sort]);

  const hasFilters = filter !== 'all' || !!tagFilter || !!searchInput;

  function clearFilters() {
    setSearchInput('');
    updateParams({ cat: null, tag: null, q: null });
  }

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

        {/* Search + sort */}
        <motion.div
          className="mb-4 flex flex-wrap items-center gap-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="relative min-w-[240px] flex-1">
            <svg
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/20"
              xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="アプリ名・技術で検索"
              className="w-full rounded-full border border-white/[0.08] bg-white/[0.02] py-2 pl-11 pr-4 text-sm text-white placeholder:text-white/20 transition-colors focus:border-white/25 focus:outline-none"
            />
          </div>
          <div className="flex gap-1.5">
            {sorts.map((s) => (
              <button
                key={s.key}
                onClick={() => updateParams({ sort: s.key })}
                className={`rounded-full px-4 py-2 text-xs font-medium transition-all ${
                  sort === s.key
                    ? 'bg-white/15 text-white'
                    : 'border border-white/[0.06] text-white/30 hover:border-white/20 hover:text-white/60'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Category filter */}
        <motion.div
          className="mb-4 flex flex-wrap gap-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => updateParams({ cat: cat.key })}
              className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${
                filter === cat.key
                  ? 'bg-white text-black'
                  : 'border border-white/10 text-white/40 hover:border-white/30 hover:text-white/70'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </motion.div>

        {/* Tech tag filter */}
        <motion.div
          className="mb-12 flex flex-wrap items-center gap-1.5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <span className="mr-1 text-xs text-white/20">Tech:</span>
          {techTags.map((tag) => (
            <button
              key={tag}
              onClick={() => updateParams({ tag: tagFilter === tag ? null : tag })}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                tagFilter === tag
                  ? 'bg-white/15 text-white'
                  : 'border border-white/[0.06] text-white/25 hover:border-white/20 hover:text-white/50'
              }`}
            >
              {tag}
            </button>
          ))}
          <span className="ml-2 text-xs text-white/20">
            {visible.length} projects
          </span>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="ml-1 text-xs text-white/25 underline underline-offset-4 transition-colors hover:text-white/60"
            >
              条件をクリア
            </button>
          )}
        </motion.div>

        {/* Grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
          </div>
        ) : visible.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-white/40">条件に合うアプリがありません</p>
            <button
              onClick={clearFilters}
              className="mt-4 rounded-full border border-white/15 px-5 py-2 text-sm text-white/60 transition-colors hover:border-white/40 hover:text-white"
            >
              条件をクリア
            </button>
          </div>
        ) : (
        <motion.div
          layout
          className="columns-1 gap-5 sm:columns-2 lg:columns-3 xl:columns-4"
        >
          <AnimatePresence mode="popLayout">
            {visible.map((project, i) => {
              const status = statusLabel[project.status];
              const isComingSoon = project.status === 'coming-soon';
              const size = project.size || 'medium';
              const isLarge = size === 'large';
              const isSmall = size === 'small';
              const screenshot = project.screenshots?.[0];
              const tagLimit = isLarge ? 5 : isSmall ? 2 : 3;
              const isNew = daysSince(project.updatedAt) <= NEW_BADGE_DAYS;
              const downloads = project.downloadCount ?? 0;

              return (
                <motion.div
                  key={project.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                  className="mb-5 break-inside-avoid"
                >
                  <Link
                    to={`/apps/${project.id}`}
                    className={`group relative block overflow-hidden rounded-2xl transition-all hover:bg-white/[0.04] ${
                      isComingSoon
                        ? 'border border-dashed border-blue-400/20 bg-blue-400/[0.02] hover:border-blue-400/40'
                        : 'border border-white/[0.06] bg-white/[0.02] hover:border-white/20'
                    } ${isSmall ? 'p-4' : 'p-6'}`}
                  >
                    {/* Cover — large only. スクショが無くても枠が空かないよう色で埋める */}
                    {isLarge && (
                      <div className="-mx-6 -mt-6 mb-5 overflow-hidden bg-white/[0.03]">
                        {screenshot ? (
                          <img src={screenshot} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                        ) : (
                          <div
                            className="flex aspect-video items-center justify-center"
                            style={{ background: coverStyle(project.id) }}
                          >
                            {project.icon ? (
                              <img src={project.icon} alt="" className="h-16 w-16 rounded-2xl border border-white/10 object-cover shadow-lg" loading="lazy" />
                            ) : (
                              <span className="text-6xl opacity-50">{categoryEmoji[project.category]}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 情報の並びは全サイズで共通。行ごと消すと視線の位置が揃わないので、
                        大きさの差はフォントサイズと余白だけでつける */}

                    {/* Row 1: icon + category / status */}
                    <div className={`flex items-center justify-between gap-2 ${isSmall ? 'mb-2.5' : 'mb-4'}`}>
                      <div className="flex min-w-0 items-center gap-2.5">
                        {project.icon ? (
                          <img src={project.icon} alt="" className={`shrink-0 rounded-full border border-white/10 object-cover ${isSmall ? 'h-6 w-6' : 'h-8 w-8'}`} loading="lazy" />
                        ) : (
                          <span className={`shrink-0 ${isSmall ? 'text-lg' : 'text-2xl'}`}>
                            {categoryEmoji[project.category]}
                          </span>
                        )}
                        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.15em] text-white/25">
                          {categoryLabel[project.category]}
                        </span>
                      </div>
                      <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider" style={{ color: status.color }}>
                        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: status.color }} />
                        {status.text}
                      </span>
                    </div>

                    {/* Row 2: title + NEW + hover arrow */}
                    <div className="mb-1.5 flex items-center gap-2">
                      <h2 className={`min-w-0 font-bold text-white/80 transition-colors group-hover:text-white ${isSmall ? 'text-base' : isLarge ? 'text-2xl' : 'text-xl'}`}>
                        {project.title}
                      </h2>
                      {isNew && (
                        <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                          New
                        </span>
                      )}
                      <span className="ml-auto shrink-0 text-white/0 transition-all group-hover:text-white/30">→</span>
                    </div>

                    {/* Row 3: subtitle — 2行で打ち切り、カード間の高さの差を抑える */}
                    <p className={`line-clamp-2 text-sm text-white/30 transition-colors group-hover:text-white/45 ${isSmall ? 'mb-2.5' : 'mb-4'}`}>
                      {project.subtitle}
                    </p>

                    {/* Row 4: tags */}
                    <div className={`flex flex-wrap items-center gap-1.5 ${isSmall ? 'mb-3' : 'mb-4'}`}>
                      {project.tags.slice(0, tagLimit).map((tag) => (
                        <span key={tag} className={`rounded-full border border-white/[0.06] text-white/25 ${isSmall ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-[11px]'}`}>
                          {tag}
                        </span>
                      ))}
                      {project.tags.length > tagLimit && (
                        <span className="px-1 text-[11px] text-white/15">+{project.tags.length - tagLimit}</span>
                      )}
                    </div>

                    {/* Row 5: platform + stores / counts */}
                    <div className="flex items-center gap-2 border-t border-white/[0.05] pt-3">
                      <span className="truncate text-[10px] font-medium uppercase tracking-wider text-white/15">
                        {project.platform.join(' · ')}
                      </span>
                      <StoreMarks links={project.links} />
                      <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-white/15" title="ページ表示数">
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        {(project.viewCount ?? 0).toLocaleString()}
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-[10px] text-white/15" title="ダウンロード数">
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        {downloads > 0 ? downloads.toLocaleString() : '-'}
                      </span>
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
