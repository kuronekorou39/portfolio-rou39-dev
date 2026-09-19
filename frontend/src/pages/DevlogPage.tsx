import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchProjects } from '@/lib/api';
import { buildCalendar, countByProject, localToday, type DayCell } from '@/lib/devlogActivity';
import { posts, type Post } from '@/lib/posts';
import PageBackground from '@/components/PageBackground';

const PAGE_SIZE = 20;
// 活動の表示期間。約3か月
const ACTIVITY_WEEKS = 13;
// 作品別の本数に出す数。それより下は件数が小さく、棒にしても読めない
const TOP_PROJECTS = 6;
const WEEKDAY_LABELS = ['月', '', '水', '', '金', '', ''];

// 1 色の濃淡で量を表す。3 件以上は同じ濃さに丸める(1 日 4 件以上は稀で、段を増やしても見分けられない)
function cellColor(count: number): string {
  if (count === 0) return 'rgba(255,255,255,0.06)';
  if (count === 1) return 'rgba(96,165,250,0.4)';
  if (count === 2) return 'rgba(96,165,250,0.7)';
  return 'rgb(96,165,250)';
}

const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

// 月ごとに区切る。日次で増えていくので、区切りが無いと日付の列が読みにくい
function groupByMonth(items: Post[]): { month: string; items: Post[] }[] {
  const groups: { month: string; items: Post[] }[] = [];
  for (const post of items) {
    const month = post.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last?.month === month) last.items.push(post);
    else groups.push({ month, items: [post] });
  }
  return groups;
}

function Activity({ titles }: { titles: Record<string, string> }) {
  const today = localToday();
  const calendar = useMemo(() => buildCalendar(posts, today, ACTIVITY_WEEKS), [today]);
  const from = calendar[0][0].date;
  const days = calendar.flat().filter((d) => !d.future);
  const total = days.reduce((n, d) => n + d.posts.length, 0);
  const activeDays = days.filter((d) => d.posts.length > 0).length;
  const byProject = useMemo(() => countByProject(posts, from, today), [from, today]);
  const top = byProject.slice(0, TOP_PROJECTS);
  const max = top[0]?.count ?? 1;

  // マスに触れたら、下の 1 行にその日の中身を出す。高さを固定して、出し入れでレイアウトを動かさない
  const [hover, setHover] = useState<DayCell | null>(null);
  const name = (id: string) => titles[id] ?? id;

  return (
    <section className="mb-14 rounded-2xl border border-white/[0.08] bg-black/30 p-6 backdrop-blur-sm">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="text-sm font-bold text-white/85">直近 {ACTIVITY_WEEKS} 週の活動</h2>
        <dl className="flex gap-6 text-xs text-white/45">
          {[
            ['記事', total],
            ['活動した日', activeDays],
            ['作品', byProject.length],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-1.5">
              <dd className="text-lg font-bold tabular-nums text-white/90">{value}</dd>
              <dt>{label}</dt>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid gap-8 md:grid-cols-[auto_1fr]">
        {/* 日ごとの記事数 */}
        <div>
          <div className="flex gap-[3px]" onMouseLeave={() => setHover(null)}>
            <div className="mr-1 flex flex-col gap-[3px] pt-[18px]">
              {WEEKDAY_LABELS.map((label, i) => (
                <span key={i} className="h-[14px] text-[10px] leading-[14px] text-white/30">{label}</span>
              ))}
            </div>
            {calendar.map((week, w) => {
              const month = week[0].date.slice(5, 7);
              const showMonth = w === 0 || calendar[w - 1][0].date.slice(5, 7) !== month;
              return (
                <div key={week[0].date} className="flex flex-col gap-[3px]">
                  <span className="h-[15px] text-[10px] leading-[15px] text-white/30">
                    {showMonth ? `${Number(month)}月` : ''}
                  </span>
                  {week.map((day) =>
                    day.future ? (
                      <span key={day.date} className="h-[14px] w-[14px]" />
                    ) : (
                      <button
                        key={day.date}
                        type="button"
                        aria-label={`${shortDate(day.date)} ${day.posts.length} 件`}
                        onMouseEnter={() => setHover(day)}
                        onFocus={() => setHover(day)}
                        onClick={() => setHover(day)}
                        className="h-[14px] w-[14px] rounded-[3px] outline-none ring-white/60 focus-visible:ring-1"
                        style={{ background: cellColor(day.posts.length) }}
                      />
                    ),
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 h-4 truncate text-xs text-white/55">
            {hover
              ? `${shortDate(hover.date)} · ${
                  hover.posts.length === 0
                    ? '記事なし'
                    : `${hover.posts.length} 件 (${[...new Set(hover.posts.flatMap((p) => p.projects))].map(name).join('、')})`
                }`
              : ''}
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-white/30">
            少
            {[0, 1, 2, 3].map((n) => (
              <span key={n} className="h-[10px] w-[10px] rounded-[2px]" style={{ background: cellColor(n) }} />
            ))}
            多
          </div>
        </div>

        {/* 作品別の記事数 */}
        <div className="min-w-0">
          <h3 className="mb-3 text-[11px] font-semibold text-white/40">作品別の記事数</h3>
          <ul className="space-y-2">
            {top.map(({ id, count }) => (
              <li key={id} className="grid grid-cols-[7.5rem_1fr_1.5rem] items-center gap-3 text-xs">
                <Link to={`/apps/${id}`} className="truncate text-white/60 transition-colors hover:text-white">
                  {name(id)}
                </Link>
                <span className="h-2 rounded-r-[4px] bg-[#60a5fa]/70" style={{ width: `${(count / max) * 100}%` }} />
                <span className="text-right tabular-nums text-white/60">{count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  // 先頭・末尾・現在地の前後だけ出す。間は … で省く
  const shown = [...new Set([1, pages, page - 1, page, page + 1])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const button = 'rounded-full px-3 py-1.5 text-xs tabular-nums transition-colors';

  return (
    <nav className="mt-10 flex flex-wrap items-center justify-center gap-1.5" aria-label="ページ">
      <button
        type="button"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
        className={`${button} text-white/50 hover:text-white disabled:opacity-25 disabled:hover:text-white/50`}
      >
        ← 新しい
      </button>
      {shown.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && p - shown[i - 1] > 1 && <span className="text-xs text-white/25">…</span>}
          <button
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={`${button} ${p === page ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white'}`}
          >
            {p}
          </button>
        </span>
      ))}
      <button
        type="button"
        disabled={page === pages}
        onClick={() => onChange(page + 1)}
        className={`${button} text-white/50 hover:text-white disabled:opacity-25 disabled:hover:text-white/50`}
      >
        古い →
      </button>
    </nav>
  );
}

export default function DevlogPage() {
  const [params, setParams] = useSearchParams();
  const pages = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(params.get('page')) || 1));
  const groups = groupByMonth(posts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
  const listRef = useRef<HTMLDivElement>(null);

  // 作品の id を表示名にする。引けなくても id のまま出せる
  const [titles, setTitles] = useState<Record<string, string>>({});
  useEffect(() => {
    fetchProjects()
      .then((all) => setTitles(Object.fromEntries(all.map((p) => [p.id, p.title]))))
      .catch(() => {});
  }, []);

  function changePage(next: number) {
    setParams(next === 1 ? {} : { page: String(next) });
    // ページを替えたら一覧の頭へ。活動のパネルまで戻すと、毎回スクロールし直すことになる
    listRef.current?.scrollIntoView({ block: 'start' });
  }

  return (
    <div className="relative isolate min-h-screen bg-[#060608] text-white">
      <PageBackground />
      <div className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="mb-3 text-5xl font-black tracking-tight md:text-6xl">Devlog</h1>
        <p className="mb-10 text-lg text-white/40">開発の記録。その日に進んだことを、作品ごとに短く</p>

        {posts.length === 0 ? (
          <p className="py-20 text-center text-white/40">まだ記事がありません</p>
        ) : (
          <>
            <Activity titles={titles} />

            <div ref={listRef} className="scroll-mt-20">
              {groups.map(({ month, items }) => (
                <section key={month} className="mb-10">
                  <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-white/30">
                    {month.replace('-', ' / ')}
                  </h2>
                  <ul className="border-t border-white/[0.06]">
                    {items.map((post) => (
                      <li key={post.slug} className="border-b border-white/[0.06]">
                        <Link
                          to={`/devlog/${post.slug}`}
                          className="group flex items-start gap-5 py-5 transition-colors hover:bg-white/[0.02]"
                        >
                          <time dateTime={post.date} className="w-10 shrink-0 pt-0.5 text-sm tabular-nums text-white/30">
                            {post.date.slice(5).replace('-', '/')}
                          </time>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-bold text-white/85 transition-colors group-hover:text-white">
                              {post.title}
                            </h3>
                            {post.summary && <p className="mt-1 text-sm text-white/45">{post.summary}</p>}
                          </div>
                          {post.image && (
                            <img
                              src={post.image}
                              alt=""
                              loading="lazy"
                              className="h-12 w-20 shrink-0 rounded-lg border border-white/[0.08] object-cover object-left-top sm:h-[72px] sm:w-32"
                            />
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            <Pager page={page} pages={pages} onChange={changePage} />
          </>
        )}
      </div>
    </div>
  );
}
