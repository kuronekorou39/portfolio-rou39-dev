import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { kindLabel, categoryEmoji, statusLabel } from '@/data/mockProjects';
import { fetchProjects } from '@/lib/api';
import type { Project, ProjectCategory } from '../../../shared/src/types';
import PageBackground from '@/components/PageBackground';

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

function daysSince(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? (Date.now() - t) / 86_400_000 : Infinity;
}

// 技術タグは 1 行に収める。入りきらないぶんは「+N」にまとめる。
// 幅はカードごとに違うので、全部を見えない所に並べて測ってから、入る数を決める
function TagLine({ tags, small }: { tags: string[]; small: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(tags.length);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const measure = measureRef.current;
    if (!box || !measure) return;
    const fit = () => {
      const gap = parseFloat(getComputedStyle(measure).columnGap) || 0;
      const widths = [...measure.querySelectorAll<HTMLElement>('[data-tag]')].map((el) => el.offsetWidth);
      const moreWidth = measure.querySelector<HTMLElement>('[data-more]')?.offsetWidth ?? 0;
      const total = widths.reduce((sum, w, i) => sum + w + (i > 0 ? gap : 0), 0);
      if (total <= box.clientWidth) return setShown(tags.length);
      // 入りきらないときは、+N の幅を先に取っておいて、前から詰める
      let used = moreWidth;
      let count = 0;
      for (const w of widths) {
        if (used + gap + w > box.clientWidth) break;
        used += gap + w;
        count += 1;
      }
      setShown(count);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [tags]);

  const chip = `shrink-0 whitespace-nowrap rounded-full border border-white/[0.12] text-white/50 ${
    small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-[11px] xl:text-xs'
  }`;
  const more = 'shrink-0 whitespace-nowrap px-1 text-[11px] text-white/40 xl:text-xs';
  const rest = tags.length - shown;

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-1.5 overflow-hidden">
        {tags.slice(0, shown).map((tag) => (
          <span key={tag} className={chip}>{tag}</span>
        ))}
        {rest > 0 && <span className={more}>+{rest}</span>}
      </div>
      <div ref={measureRef} className="pointer-events-none invisible absolute left-0 top-0 flex gap-1.5" aria-hidden>
        {tags.map((tag) => (
          <span key={tag} data-tag className={chip}>{tag}</span>
        ))}
        <span data-more className={more}>+{tags.length}</span>
      </div>
    </div>
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
  // 検索と絞り込みは畳んでおく。条件付きの URL で来たときは、何が効いているか見えるよう開く
  const [filtersOpen, setFiltersOpen] = useState(hasFilters || sort !== DEFAULT_SORT);

  function clearFilters() {
    setSearchInput('');
    updateParams({ cat: null, tag: null, q: null });
  }

  return (
    <div className="relative isolate min-h-screen bg-[#060608] text-white">
      <PageBackground />
      <div className="mx-auto max-w-6xl px-6 py-20 2xl:max-w-7xl">
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

        {/* 開閉ボタン + 件数 */}
        <motion.div
          className="mb-4 flex flex-wrap items-center gap-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <button
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="apps-filters"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#0b0c10]/60 px-4 py-2 text-xs font-medium text-white/60 transition-colors hover:border-white/40 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            検索・絞り込み
            <span className={`transition-transform ${filtersOpen ? 'rotate-180' : ''}`} aria-hidden>▾</span>
          </button>
          <span className="text-xs text-white/40">{visible.length} 件</span>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-white/45 underline underline-offset-4 transition-colors hover:text-white/80"
            >
              条件をクリア
            </button>
          )}
        </motion.div>

        {/* 開くときと同じ動きで閉じる。高さも縮めて、下のカードが滑らかに上がるようにする */}
        <AnimatePresence initial={false}>
        {filtersOpen && (
        <motion.div
          id="apps-filters"
          className="overflow-hidden"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
        <div className="pb-4">
        {/* Search + sort */}
        <motion.div
          className="mb-4 flex flex-wrap items-center gap-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
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
                    : 'border border-white/[0.12] text-white/50 hover:border-white/30 hover:text-white/80'
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
          exit={{ opacity: 0, y: 10 }}
          transition={{ delay: 0.05 }}
        >
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => updateParams({ cat: cat.key })}
              className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${
                filter === cat.key
                  ? 'bg-white text-black'
                  : 'border border-white/15 text-white/55 hover:border-white/40 hover:text-white/85'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </motion.div>

        {/* Tech tag filter */}
        <motion.div
          className="flex flex-wrap items-center gap-1.5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ delay: 0.1 }}
        >
          <span className="mr-1 text-xs text-white/40">Tech:</span>
          {techTags.map((tag) => (
            <button
              key={tag}
              onClick={() => updateParams({ tag: tagFilter === tag ? null : tag })}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                tagFilter === tag
                  ? 'bg-white/15 text-white'
                  : 'border border-white/[0.12] text-white/50 hover:border-white/30 hover:text-white/80'
              }`}
            >
              {tag}
            </button>
          ))}
        </motion.div>
        </div>
        </motion.div>
        )}
        </AnimatePresence>

        {/* Grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
          </div>
        ) : projects.length === 0 ? (
          <p className="py-20 text-center text-white/40">準備中</p>
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
          className="mt-6 columns-1 gap-5 sm:columns-2 lg:columns-3 xl:gap-6"
        >
          <AnimatePresence mode="popLayout">
            {visible.map((project, i) => {
              const status = statusLabel[project.status];
              const isComingSoon = project.status === 'coming-soon';
              const size = project.size || 'medium';
              const isLarge = size === 'large';
              const isSmall = size === 'small';
              // 画像は 1 枚だけ、カードの下端に敷いてフェードで溶かす。小さいカードには置かない
              const shot = isSmall ? undefined : project.cover ?? project.screenshots?.[0];
              const isNew = daysSince(project.updatedAt) <= NEW_BADGE_DAYS;

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
                    className={`group relative block overflow-hidden rounded-2xl backdrop-blur-md transition-all hover:bg-[#12141a]/85 ${
                      isComingSoon
                        ? 'border border-dashed border-blue-400/30 bg-[#0b0c10]/75 hover:border-blue-400/50'
                        : 'border border-white/[0.12] bg-[#0b0c10]/75 hover:border-white/30'
                    } ${isSmall ? 'p-4' : 'p-6 xl:p-8'}`}
                  >
                    {/* 情報の並びは全サイズで共通。行ごと消すと視線の位置が揃わないので、
                        大きさの差はフォントサイズと余白だけでつける */}

                    {/* Row 1: status。左に寄せ、右は空けてゆとりにする */}
                    <span className={`flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider ${isSmall ? 'mb-2' : 'mb-3'}`} style={{ color: status.color }}>
                      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: status.color }} />
                      {status.text}
                    </span>

                    {/* Row 2: icon + category。アイコンは元の角丸のまま見せる(丸く切らない) */}
                    <div className={`flex min-w-0 items-center gap-2.5 ${isSmall ? 'mb-2.5' : 'mb-4'}`}>
                      {project.icon ? (
                        <img src={project.icon} alt="" className={`shrink-0 rounded-[22%] object-cover ${isSmall ? 'h-7 w-7' : 'h-10 w-10 xl:h-12 xl:w-12'}`} loading="lazy" />
                      ) : (
                        <span className={`shrink-0 ${isSmall ? 'text-lg' : 'text-2xl'}`}>
                          {categoryEmoji[project.category]}
                        </span>
                      )}
                      <span className="truncate text-[11px] font-semibold tracking-[0.08em] text-white/55 xl:text-xs">
                        {kindLabel(project)}
                      </span>
                    </div>

                    {/* Row 3: title + NEW + hover arrow */}
                    <div className="mb-1.5 flex items-center gap-2">
                      <h2 className={`min-w-0 font-bold text-white/90 transition-colors group-hover:text-white ${isSmall ? 'text-base xl:text-lg' : isLarge ? 'text-2xl xl:text-3xl' : 'text-xl xl:text-2xl'}`}>
                        {project.title}
                      </h2>
                      {isNew && (
                        <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                          New
                        </span>
                      )}
                      <span className="ml-auto shrink-0 text-white/0 transition-all group-hover:text-white/60">→</span>
                    </div>

                    {/* Row 4: subtitle — 2行で打ち切り、カード間の高さの差を抑える */}
                    <p className={`line-clamp-2 text-sm text-white/55 xl:text-base transition-colors group-hover:text-white/70 ${isSmall ? 'mb-2.5' : 'mb-4'}`}>
                      {project.subtitle}
                    </p>

                    {/* Row 5: tags。1 行に入るぶんだけ出し、残りは +N にまとめる */}
                    <TagLine tags={project.tags} small={isSmall} />

                    {/* 下端のスクショ。上をフェードさせて、文字の領域から地続きに見せる */}
                    {shot && (
                      <div
                        className={`pointer-events-none relative -mx-6 -mb-6 mt-4 overflow-hidden xl:-mx-8 xl:-mb-8 ${isLarge ? 'h-48 xl:h-64' : 'h-36 xl:h-48'}`}
                        style={{
                          maskImage: 'linear-gradient(to bottom, transparent, black 70%)',
                          WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 70%)',
                        }}
                      >
                        <img
                          src={shot}
                          alt=""
                          className="h-full w-full object-cover object-top opacity-60 transition-all duration-500 group-hover:scale-[1.03] group-hover:opacity-90"
                          loading="lazy"
                        />
                      </div>
                    )}
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
