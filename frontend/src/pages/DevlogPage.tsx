import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchProjects } from '@/lib/api';
import { buildCalendar, countByProject, localToday, type DayCell } from '@/lib/devlogActivity';
import { fetchPostIndex, type PostMeta } from '@/lib/posts';
import { categoryEmoji } from '@/data/mockProjects';
import PageBackground from '@/components/PageBackground';
import type { Project } from '../../../shared/src/types';

const PAGE_SIZE = 20;
// 活動の表示期間。約3か月
const ACTIVITY_WEEKS = 13;
// アプリ別のログ数に出す数。それより下は件数が小さく、棒にしても読めない
const TOP_PROJECTS = 6;
const WEEKDAY_LABELS = ['月', '', '水', '', '金', '', ''];

type AppInfo = Pick<Project, 'id' | 'title' | 'icon' | 'category'>;

// 1 色の濃淡で量を表す。3 件以上は同じ濃さに丸める(1 日 4 件以上は稀で、段を増やしても見分けられない)
function cellColor(count: number): string {
  if (count === 0) return 'rgba(255,255,255,0.08)';
  if (count === 1) return 'rgba(96,165,250,0.45)';
  if (count === 2) return 'rgba(96,165,250,0.75)';
  return 'rgb(96,165,250)';
}

const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

// 月ごとに区切る。日次で増えていくので、区切りが無いと日付の列が読みにくい
function groupByMonth(items: PostMeta[]): { month: string; items: PostMeta[] }[] {
  const groups: { month: string; items: PostMeta[] }[] = [];
  for (const post of items) {
    const month = post.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last?.month === month) last.items.push(post);
    else groups.push({ month, items: [post] });
  }
  return groups;
}

/** アプリのアイコン。アイコンが無いアプリは分類の絵文字で代える */
function AppIcon({ app, className }: { app?: AppInfo; className: string }) {
  if (app?.icon) return <img src={app.icon} alt="" loading="lazy" className={`${className} shrink-0 rounded-[22%] object-cover`} />;
  return (
    <span className={`${className} flex shrink-0 items-center justify-center rounded-[22%] bg-white/[0.08] text-base`}>
      {app ? categoryEmoji[app.category] : '·'}
    </span>
  );
}

function Activity({
  posts,
  apps,
  date,
  app,
  onDate,
  onApp,
}: {
  posts: PostMeta[];
  apps: Record<string, AppInfo>;
  date: string | null;
  app: string | null;
  onDate: (date: string) => void;
  onApp: (id: string) => void;
}) {
  const today = localToday();
  const calendar = useMemo(() => buildCalendar(posts, today, ACTIVITY_WEEKS), [posts, today]);
  const from = calendar[0][0].date;
  const days = calendar.flat().filter((d) => !d.future);
  const total = days.reduce((n, d) => n + d.posts.length, 0);
  const workDays = days.filter((d) => d.posts.length > 0).length;
  const byProject = useMemo(() => countByProject(posts, from, today), [posts, from, today]);
  const top = byProject.slice(0, TOP_PROJECTS);
  const max = top[0]?.count ?? 1;

  // 狭い窓では場所を取らないよう、カレンダーとアプリ別を切り替えて片方だけ出す。
  // 広い窓(xl 以上)では一覧の横に置くので、切り替えを隠して両方出す
  const [view, setView] = useState<'calendar' | 'apps'>('calendar');
  // マスに触れたら、下の 1 行にその日の中身を出す。高さを固定して、出し入れでレイアウトを動かさない
  const [hover, setHover] = useState<DayCell | null>(null);
  const name = (id: string) => apps[id]?.title ?? id;

  return (
    <section className="rounded-2xl border border-white/10 bg-[#0d0f14]/85 p-5 backdrop-blur-md">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-white/85">直近 {ACTIVITY_WEEKS} 週</h2>
        <div className="flex gap-1 xl:hidden">
          {([['calendar', 'カレンダー'], ['apps', 'アプリ別']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                view === key ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white/80'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <dl className="mb-5 flex gap-5 text-xs text-white/60">
        {[
          ['ログ', total],
          ['作業日', workDays],
          ['アプリ', byProject.length],
        ].map(([label, value]) => (
          <div key={label} className="flex items-baseline gap-1.5">
            <dd className="text-lg font-bold tabular-nums text-white">{value}</dd>
            <dt>{label}</dt>
          </div>
        ))}
      </dl>

      {/* 日ごとのログ数。押すとその日のログに絞る */}
      <div className={`${view === 'calendar' ? 'block' : 'hidden'} xl:block`}>
        <div className="flex gap-[3px]" onMouseLeave={() => setHover(null)}>
          <div className="mr-1 flex flex-col gap-[3px] pt-[18px]">
            {WEEKDAY_LABELS.map((label, i) => (
              <span key={i} className="h-[14px] text-[10px] leading-[14px] text-white/45">{label}</span>
            ))}
          </div>
          {calendar.map((week, w) => {
            const month = week[0].date.slice(5, 7);
            const showMonth = w === 0 || calendar[w - 1][0].date.slice(5, 7) !== month;
            return (
              <div key={week[0].date} className="flex w-[14px] flex-col gap-[3px]">
                {/* ラベルは列幅より広い。折り返さず、隣の列の上にはみ出させる */}
                <span className="h-[15px] whitespace-nowrap text-[10px] leading-[15px] text-white/45">
                  {showMonth ? `${Number(month)}月` : ''}
                </span>
                {week.map((day) =>
                  day.future ? (
                    <span key={day.date} className="h-[14px] w-[14px]" />
                  ) : (
                    <button
                      key={day.date}
                      type="button"
                      aria-pressed={date === day.date}
                      aria-label={`${shortDate(day.date)} ${day.posts.length} 件`}
                      onMouseEnter={() => setHover(day)}
                      onFocus={() => setHover(day)}
                      onClick={() => (day.posts.length > 0 ? onDate(day.date) : setHover(day))}
                      className={`h-[14px] w-[14px] rounded-[3px] outline-none ring-white focus-visible:ring-1 ${
                        day.posts.length > 0 ? 'cursor-pointer hover:brightness-150' : 'cursor-default'
                      } ${date === day.date ? 'ring-2' : ''}`}
                      style={{ background: cellColor(day.posts.length) }}
                    />
                  ),
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 h-4 truncate text-xs text-white/70">
          {hover
            ? `${shortDate(hover.date)} · ${
                hover.posts.length === 0
                  ? 'ログなし'
                  : `${hover.posts.length} 件 (${[...new Set(hover.posts.flatMap((p) => p.projects))].map(name).join('、')})`
              }`
            : '日を押すと、その日のログに絞る'}
        </p>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-white/45">
          少
          {[0, 1, 2, 3].map((n) => (
            <span key={n} className="h-[10px] w-[10px] rounded-[2px]" style={{ background: cellColor(n) }} />
          ))}
          多
        </div>
      </div>

      {/* アプリ別のログ数。押すとそのアプリのログに絞る */}
      <div className={`${view === 'apps' ? 'block' : 'hidden'} xl:mt-6 xl:block xl:border-t xl:border-white/10 xl:pt-5`}>
        <h3 className="mb-3 hidden text-xs font-semibold text-white/60 xl:block">アプリ別</h3>
        <ul className="space-y-1">
          {top.map(({ id, count }) => (
            <li key={id}>
              <button
                type="button"
                aria-pressed={app === id}
                onClick={() => onApp(id)}
                className={`grid w-full grid-cols-[1.5rem_6rem_1fr_1.5rem] items-center gap-2.5 rounded-lg px-1.5 py-1 text-left text-xs transition-colors ${
                  app === id ? 'bg-white/[0.12] text-white' : 'text-white/75 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <AppIcon app={apps[id]} className="h-6 w-6" />
                <span className="truncate">{name(id)}</span>
                <span className="h-2 rounded-r-[4px] bg-[#60a5fa]/80" style={{ width: `${(count / max) * 100}%` }} />
                <span className="text-right tabular-nums text-white/70">{count}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  // 先頭・末尾・現在地の前後だけ出す。間は … で省く
  const shown = [...new Set([1, pages, page - 1, page, page + 1])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const button = 'rounded-full px-3 py-1.5 text-sm tabular-nums transition-colors';

  return (
    <nav className="mt-10 flex flex-wrap items-center justify-center gap-1.5" aria-label="ページ">
      <button
        type="button"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
        className={`${button} text-white/65 hover:text-white disabled:opacity-30 disabled:hover:text-white/65`}
      >
        ← 新しい
      </button>
      {shown.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && p - shown[i - 1] > 1 && <span className="text-sm text-white/40">…</span>}
          <button
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={`${button} ${p === page ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white'}`}
          >
            {p}
          </button>
        </span>
      ))}
      <button
        type="button"
        disabled={page === pages}
        onClick={() => onChange(page + 1)}
        className={`${button} text-white/65 hover:text-white disabled:opacity-30 disabled:hover:text-white/65`}
      >
        古い →
      </button>
    </nav>
  );
}

export default function DevlogPage() {
  const [params, setParams] = useSearchParams();
  // null = 読み込み中
  const [posts, setPosts] = useState<PostMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetchPostIndex().then(setPosts).catch(() => setFailed(true));
  }, []);

  // アプリの id から表示名とアイコンを引く。引けなくても id のまま出せる
  const [apps, setApps] = useState<Record<string, AppInfo>>({});
  useEffect(() => {
    fetchProjects()
      .then((all) => setApps(Object.fromEntries(all.map((p) => [p.id, p]))))
      .catch(() => {});
  }, []);

  // 絞り込みは URL に持つ。タイムラインや記事から「その日」「そのアプリ」で開けるように
  const date = params.get('date');
  const app = params.get('app');
  const all = posts ?? [];
  const filtered = all.filter((p) => (!date || p.date === date) && (!app || p.projects.includes(app)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(params.get('page')) || 1));
  const groups = groupByMonth(filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
  const listRef = useRef<HTMLDivElement>(null);

  function update(next: { date?: string | null; app?: string | null; page?: number }) {
    const merged = { date, app, page: 1, ...next };
    const search: Record<string, string> = {};
    if (merged.date) search.date = merged.date;
    if (merged.app) search.app = merged.app;
    if (merged.page > 1) search.page = String(merged.page);
    setParams(search);
  }

  function changePage(next: number) {
    update({ page: next });
    // ページを替えたら一覧の頭へ。活動のパネルまで戻すと、毎回スクロールし直すことになる
    listRef.current?.scrollIntoView({ block: 'start' });
  }

  // 同じものをもう一度押したら絞り込みを外す
  const toggleDate = (d: string) => update({ date: date === d ? null : d });
  const toggleApp = (id: string) => update({ app: app === id ? null : id });

  return (
    <div className="relative isolate min-h-screen bg-[#060608] text-white">
      <PageBackground />
      <div className="mx-auto max-w-3xl px-5 py-20 sm:px-6 xl:max-w-6xl">
        <h1 className="mb-3 text-5xl font-black tracking-tight md:text-6xl">Devlog</h1>
        <p className="mb-10 text-lg text-white/60">開発の記録</p>

        {posts === null ? (
          failed ? (
            <p className="py-20 text-center text-white/60">ログを読み込めませんでした</p>
          ) : (
            <div className="flex justify-center py-20">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-white/50" />
            </div>
          )
        ) : posts.length === 0 ? (
          <p className="py-20 text-center text-white/60">まだログがありません</p>
        ) : (
          <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_18.5rem] xl:items-start xl:gap-12">
            {/* 狭い窓では一覧の上、広い窓では右に固定する */}
            <aside className="mb-8 xl:sticky xl:top-24 xl:order-2 xl:mb-0">
              <Activity posts={posts} apps={apps} date={date} app={app} onDate={toggleDate} onApp={toggleApp} />
            </aside>

            <div className="min-w-0 xl:order-1">
              <div ref={listRef} className="scroll-mt-20">
                {(date || app) && (
                  <div className="mb-8 flex flex-wrap items-center gap-2">
                    {date && (
                      <button
                        type="button"
                        onClick={() => update({ date: null })}
                        className="flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.08] py-1.5 pl-3.5 pr-3 text-sm text-white transition-colors hover:bg-white/[0.14]"
                      >
                        {date.replace(/-/g, '/')}
                        <span className="text-white/60" aria-label="外す">×</span>
                      </button>
                    )}
                    {app && (
                      <button
                        type="button"
                        onClick={() => update({ app: null })}
                        className="flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.08] py-1 pl-1.5 pr-3 text-sm text-white transition-colors hover:bg-white/[0.14]"
                      >
                        <AppIcon app={apps[app]} className="h-6 w-6" />
                        {apps[app]?.title ?? app}
                        <span className="text-white/60" aria-label="外す">×</span>
                      </button>
                    )}
                    <span className="text-sm text-white/55">{filtered.length} 件</span>
                    {app && (
                      <Link to={`/apps/${app}`} className="ml-auto text-sm text-white/60 transition-colors hover:text-white">
                        アプリのページ →
                      </Link>
                    )}
                  </div>
                )}

                {filtered.length === 0 && <p className="py-16 text-center text-white/60">該当するログがありません</p>}

                {groups.map(({ month, items }) => (
                  <section key={month} className="mb-10">
                    <h2 className="mb-3 text-sm font-semibold tracking-[0.15em] text-white/55">{month.replace('-', ' / ')}</h2>
                    <ul className="border-t border-white/10">
                      {items.map((post) => {
                        const appId = post.projects[0];
                        const info = apps[appId];
                        return (
                          <li key={post.slug} className="border-b border-white/10">
                            <Link
                              to={`/devlog/${post.slug}`}
                              className="group flex items-start gap-3.5 py-5 transition-colors hover:bg-white/[0.03] sm:gap-4"
                            >
                              <AppIcon app={info} className="mt-0.5 h-10 w-10 sm:h-11 sm:w-11" />
                              <div className="min-w-0 flex-1">
                                <div className="mb-1 flex items-center gap-2 text-xs text-white/55">
                                  <time dateTime={post.date} className="tabular-nums">
                                    {shortDate(post.date)}
                                  </time>
                                  <span className="text-white/30">·</span>
                                  <span className="truncate">{info?.title ?? appId}</span>
                                </div>
                                <h3 className="text-lg font-bold leading-snug text-white/95 transition-colors group-hover:text-white sm:text-xl">
                                  {post.title}
                                </h3>
                                {post.summary && <p className="mt-1.5 text-sm leading-relaxed text-white/65">{post.summary}</p>}
                              </div>
                              {post.image && (
                                <img
                                  src={post.image}
                                  alt=""
                                  loading="lazy"
                                  className="hidden h-[72px] w-32 shrink-0 rounded-lg border border-white/10 object-cover object-left-top sm:block"
                                />
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>

              <Pager page={page} pages={pages} onChange={changePage} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
