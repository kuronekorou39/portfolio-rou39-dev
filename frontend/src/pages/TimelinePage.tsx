import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchProjects } from '@/lib/api';
import {
  addDays,
  assignLanes,
  dateRange,
  dayDiff,
  fetchActivity,
  goalStatus,
  toStreaks,
  type Activity,
  type GoalState,
} from '@/lib/activity';
import { localToday } from '@/lib/devlogActivity';
import { fetchPostIndex, type PostMeta } from '@/lib/posts';
import { categoryEmoji } from '@/data/mockProjects';
import type { Project } from '../../../shared/src/types';
import PageBackground from '@/components/PageBackground';

// 表の左端(実績を集め始めた日)。右は今日から FUTURE_DAYS 日先まで。未来は予定を置くための余白
const START = '2025-01-01';
const FUTURE_DAYS = 45;
// 1 日の幅(px)。日付の数字と曜日が入る
const CELL = 34;
const LEFT_WIDTH = 224;
// 予定のバー 1 段と、実績の行の高さ
const PLAN_LANE = 32;
const ACTUAL_ROW = 40;
const BAR_HEIGHT = 24;
// 作業の空きがこの日数までなら、ひと続きのバーにまとめる(土日を挟んでも切らない)
const STREAK_MAX_GAP = 2;
// 開いたとき、今日の列を表の幅のどのあたりに置くか(右に予定が見える位置)
const TODAY_POSITION = 0.7;

const PANEL_BG = '#0b0c10';
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// 実績: 1 色の濃淡で量を表す。段の境目はコミット件数
const LEVELS = [
  { min: 10, color: 'rgb(96,165,250)', label: '10+' },
  { min: 6, color: 'rgba(96,165,250,0.78)', label: '6〜9' },
  { min: 3, color: 'rgba(96,165,250,0.55)', label: '3〜5' },
  { min: 1, color: 'rgba(96,165,250,0.34)', label: '1〜2' },
];
const levelColor = (count: number) => LEVELS.find((l) => count >= l.min)?.color;

// 予定: 状態ごとの見た目。赤は期限を過ぎたものにだけ使う
const GOAL_STYLE: Record<GoalState, { border: string; background: string; dashed?: boolean }> = {
  planned: { border: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)', dashed: true },
  active: { border: 'rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.14)' },
  overdue: { border: '#f87171', background: 'rgba(248,113,113,0.16)' },
  done: { border: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.1)' },
  'done-late': { border: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.1)' },
};
const LATE_TAIL = 'repeating-linear-gradient(135deg, rgba(248,113,113,0.5) 0 4px, rgba(248,113,113,0.15) 4px 8px)';

const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const dayOfWeek = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** 実績の日を押したときに出す吹き出し。どのアプリのどの日か、と出す位置(画面座標) */
interface Pick {
  project: Project;
  date: string;
  count: number;
  logs: PostMeta[];
  x: number;
  y: number;
}

export default function TimelinePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [posts, setPosts] = useState<PostMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pick, setPick] = useState<Pick | null>(null);

  // 吹き出しは、外を押す・Esc・スクロールで閉じる
  useEffect(() => {
    if (!pick) return;
    const close = () => setPick(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-popover]')) close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pick]);

  useEffect(() => {
    // どれかが取れなくても、残りで出せるところまで出す
    Promise.allSettled([fetchProjects(), fetchActivity(), fetchPostIndex()])
      .then(([p, a, l]) => {
        if (p.status === 'fulfilled') setProjects(p.value);
        if (a.status === 'fulfilled') setActivity(a.value);
        if (l.status === 'fulfilled') setPosts(l.value);
      })
      .finally(() => setLoading(false));
  }, []);

  const today = localToday();
  const from = START;
  const to = addDays(today, FUTURE_DAYS);
  const dates = useMemo(() => dateRange(from, to), [from, to]);
  const lastIndex = dates.length - 1;
  const gridWidth = dates.length * CELL;
  const todayIndex = dayDiff(from, today);

  /** 期間 [start, end] を、表の中の左端と幅(px)に直す。表の外なら null */
  function span(start: string, end: string): { left: number; width: number } | null {
    const a = Math.max(0, dayDiff(from, start));
    const b = Math.min(lastIndex, dayDiff(from, end));
    return a > b ? null : { left: a * CELL, width: (b - a + 1) * CELL };
  }

  // 月の見出し。月ごとに、表の中での幅を持つ
  const months = useMemo(() => {
    const list: { key: string; label: string; days: number }[] = [];
    for (const date of dates) {
      const key = date.slice(0, 7);
      const last = list.at(-1);
      if (last?.key === key) last.days += 1;
      else list.push({ key, label: `${key.slice(0, 4)}年${Number(key.slice(5))}月`, days: 1 });
    }
    return list;
  }, [dates]);

  const rows = useMemo(() => {
    const goals = activity?.goals ?? [];
    return projects
      .map((project) => {
        const days = activity?.apps[project.id] ?? {};
        const own = goals.filter((g) => g.project === project.id);
        // 遅れている目標は、終えた日か今日までバーが伸びる。段はその伸びた先まで含めて分ける
        const lanes = assignLanes(
          own.map((g) => ({ start: g.start, end: [g.due, g.done ?? (today > g.due ? today : g.due)].sort().at(-1)! })),
        );
        const logs = posts.filter((post) => post.projects.includes(project.id));
        const logsByDate = new Map<string, PostMeta[]>();
        for (const log of logs) logsByDate.set(log.date, [...(logsByDate.get(log.date) ?? []), log]);
        const last = Object.keys(days).sort().at(-1) ?? '';
        return { project, days, goals: own, lanes, laneCount: Math.max(1, ...lanes.map((l) => l + 1)), logs, logsByDate, last };
      })
      // 目標のあるアプリ、次に最近動いたアプリを上に
      .sort((a, b) => b.goals.length - a.goals.length || b.last.localeCompare(a.last) || a.project.title.localeCompare(b.project.title));
  }, [projects, activity, posts, today]);

  // 開いたときは今日のあたりを見せる
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = LEFT_WIDTH + todayIndex * CELL - el.clientWidth * TODAY_POSITION;
  }, [rows.length, todayIndex]);

  return (
    <div className="relative isolate min-h-screen bg-[#060608] text-white">
      <PageBackground />
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h1 className="mb-3 text-5xl font-black tracking-tight md:text-6xl">Timeline</h1>
        <p className="mb-10 text-lg text-white/40">予定と実績</p>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
          </div>
        ) : rows.length === 0 || !activity ? (
          <p className="py-20 text-center text-white/40">準備中</p>
        ) : (
          <>
            <div
              ref={scrollRef}
              className="overflow-x-auto rounded-2xl border border-white/[0.12] backdrop-blur-md"
              style={{ background: 'rgba(11,12,16,0.8)' }}
            >
              <div style={{ width: LEFT_WIDTH + gridWidth }}>
                {/* 見出し: 月 / 曜日と日 */}
                <div className="flex border-b border-white/[0.12]">
                  <div className="sticky left-0 z-20 shrink-0 border-r border-white/[0.12]" style={{ width: LEFT_WIDTH, background: PANEL_BG }} />
                  <div>
                    <div className="flex border-b border-white/[0.08]">
                      {months.map((month) => (
                        <div
                          key={month.key}
                          className="shrink-0 whitespace-nowrap border-l border-white/25 py-2 pl-2.5 text-sm font-semibold text-white/80 first:border-l-0"
                          style={{ width: month.days * CELL }}
                        >
                          {/* 月の頭が左の列に隠れても、月の名前は見えるところに留める */}
                          {month.days >= 3 && (
                            <span className="sticky inline-block" style={{ left: LEFT_WIDTH + 10 }}>
                              {month.label}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex">
                      {dates.map((date) => {
                        const dow = dayOfWeek(date);
                        const isToday = date === today;
                        const tone = isToday ? 'text-[#0b0c10]' : dow === 0 ? 'text-red-300/70' : dow === 6 ? 'text-sky-300/70' : 'text-white/45';
                        return (
                          <div
                            key={date}
                            className={`shrink-0 py-1.5 text-center text-[11px] leading-[1.35] ${tone} ${isToday ? 'rounded-md bg-white font-bold' : ''}`}
                            style={{ width: CELL }}
                          >
                            <div>{WEEKDAYS[dow]}</div>
                            <div className="text-sm font-medium">{Number(date.slice(8, 10))}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 本体 */}
                <div className="relative">
                  {/* 列の地: 土日・月の境・今日 */}
                  <div className="pointer-events-none absolute inset-y-0 flex" style={{ left: LEFT_WIDTH, width: gridWidth }} aria-hidden>
                    {dates.map((date) => {
                      const dow = dayOfWeek(date);
                      const background =
                        date === today ? 'rgba(255,255,255,0.1)' : dow === 0 || dow === 6 ? 'rgba(255,255,255,0.03)' : undefined;
                      return (
                        <div
                          key={date}
                          className={`shrink-0 border-l ${date.endsWith('-01') ? 'border-white/25' : 'border-white/[0.04]'}`}
                          style={{ width: CELL, background }}
                        />
                      );
                    })}
                  </div>

                  {rows.map(({ project, days, goals, lanes, laneCount, logsByDate }) => {
                    const planHeight = laneCount * PLAN_LANE + 6;
                    return (
                      <div key={project.id} className="flex border-b border-white/[0.08] last:border-b-0">
                        {/* 左: アプリ名と、予定・実績の見出し */}
                        <div
                          className="sticky left-0 z-20 flex shrink-0 border-r border-white/[0.12]"
                          style={{ width: LEFT_WIDTH, background: PANEL_BG }}
                        >
                          <Link
                            to={`/apps/${project.id}`}
                            className="flex min-w-0 flex-1 items-center gap-3 pl-4 pr-1 text-white/85 transition-colors hover:text-white"
                          >
                            {project.icon ? (
                              <img src={project.icon} alt="" className="h-11 w-11 shrink-0 rounded-[22%] object-cover" loading="lazy" />
                            ) : (
                              <span className="shrink-0 text-3xl">{categoryEmoji[project.category]}</span>
                            )}
                            <span className="truncate text-sm font-semibold">{project.title}</span>
                          </Link>
                          <div className="shrink-0 pr-2.5 text-right text-[11px] text-white/45">
                            <div className="flex items-center justify-end" style={{ height: planHeight }}>予定</div>
                            <div className="flex items-center justify-end" style={{ height: ACTUAL_ROW }}>実績</div>
                          </div>
                        </div>

                        <div className="relative" style={{ width: gridWidth }}>
                          {/* 予定: 目標ごとに着手日から期限までのバー */}
                          <div className="relative border-b border-dashed border-white/[0.06]" style={{ height: planHeight }}>
                            {goals.map((goal, i) => {
                              const status = goalStatus(goal, today);
                              const look = GOAL_STYLE[status.state];
                              const bar = span(goal.start, goal.due);
                              // 期限を過ぎたぶんは、赤い斜線で後ろに伸ばす
                              const tail = status.lateDays > 0 ? span(addDays(goal.due, 1), goal.done ?? today) : null;
                              const top = 3 + lanes[i] * PLAN_LANE + (PLAN_LANE - BAR_HEIGHT) / 2;
                              const label = `${goal.title}(${shortDate(goal.start)}〜${shortDate(goal.due)} / ${status.text})`;
                              return (
                                <div key={`${goal.start}-${goal.title}`}>
                                  {bar && (
                                    // 目標の文はバーに出さず、マウスを乗せたときだけ見せる
                                    <div
                                      title={label}
                                      className="absolute rounded-md"
                                      style={{
                                        ...bar,
                                        top,
                                        height: BAR_HEIGHT,
                                        border: `1.5px ${look.dashed ? 'dashed' : 'solid'} ${look.border}`,
                                        background: look.background,
                                      }}
                                    />
                                  )}
                                  {tail && (
                                    <div
                                      title={label}
                                      className="absolute rounded-r-md"
                                      style={{ ...tail, top: top + 3, height: BAR_HEIGHT - 6, background: LATE_TAIL }}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* 実績: ひと続きの作業を 1 本のバーにし、中を日ごとの件数で塗る */}
                          <div className="relative" style={{ height: ACTUAL_ROW }}>
                            {toStreaks(days, STREAK_MAX_GAP).map((streak) => {
                              const bar = span(streak.start, streak.end);
                              if (!bar) return null;
                              const first = Math.max(0, dayDiff(from, streak.start));
                              const title = `${shortDate(streak.start)}〜${shortDate(streak.end)}: 作業 ${streak.workDays} 日 / ${streak.commits} コミット`;
                              return (
                                <div
                                  key={streak.start}
                                  title={title}
                                  className="absolute flex overflow-hidden rounded-md"
                                  style={{
                                    ...bar,
                                    top: (ACTUAL_ROW - BAR_HEIGHT) / 2,
                                    height: BAR_HEIGHT,
                                    background: 'rgba(96,165,250,0.14)',
                                    boxShadow: 'inset 0 0 0 1px rgba(96,165,250,0.35)',
                                  }}
                                >
                                  {Array.from({ length: bar.width / CELL }, (_, i) => {
                                    const date = dates[first + i];
                                    const count = days[date] ?? 0;
                                    const dayLogs = logsByDate.get(date) ?? [];
                                    if (count === 0 && dayLogs.length === 0) {
                                      return <div key={date} title={title} className="shrink-0" style={{ width: CELL }} />;
                                    }
                                    // 作業のあった日は押せる。その日にやったことを吹き出しで出す
                                    return (
                                      <button
                                        key={date}
                                        type="button"
                                        aria-label={`${shortDate(date)} にやったこと`}
                                        onClick={(e) => {
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          setPick({ project, date, count, logs: dayLogs, x: rect.left + rect.width / 2, y: rect.bottom });
                                        }}
                                        className="relative flex shrink-0 items-center justify-center outline-none transition-[filter] hover:brightness-150 focus-visible:ring-2 focus-visible:ring-white/70"
                                        style={{ width: CELL, background: levelColor(count) }}
                                      >
                                        {/* ログのある日は白い点 */}
                                        {dayLogs.length > 0 && <span className="h-2 w-2 rounded-full bg-white/90" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 凡例 */}
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/55">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-6 rounded-[4px] border-[1.5px] border-white/90 bg-white/15" />
                予定
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-6 rounded-[4px]" style={{ background: LATE_TAIL }} />
                期限を過ぎた分
              </span>
              <span className="flex items-center gap-1.5">
                実績(コミット)
                {[...LEVELS].reverse().map((level) => (
                  <span key={level.label} className="flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded-[3px]" style={{ background: level.color }} />
                    {level.label}
                  </span>
                ))}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-white" />
                ログあり(日を押すと、その日にやったことが出る)
              </span>
              {activity.updatedAt && <span className="ml-auto text-white/35">実績は {shortDate(activity.updatedAt)} 時点</span>}
            </div>

            {pick && <DayPopover pick={pick} />}
          </>
        )}
      </div>
    </div>
  );
}

const POPOVER_WIDTH = 300;

/** 押した日の下に出す吹き出し。ログのタイトルを押すと、その日のログを開く */
function DayPopover({ pick }: { pick: Pick }) {
  // 画面の端からはみ出さないよう、左右を詰める
  const left = Math.min(Math.max(12, pick.x - POPOVER_WIDTH / 2), window.innerWidth - POPOVER_WIDTH - 12);
  const weekday = WEEKDAYS[dayOfWeek(pick.date)];
  return (
    <div
      data-popover
      role="dialog"
      aria-label={`${pick.project.title} ${shortDate(pick.date)}`}
      className="fixed z-50 rounded-xl border border-white/15 bg-[#12141a]/95 p-4 shadow-2xl backdrop-blur-md"
      style={{ left, top: pick.y + 8, width: POPOVER_WIDTH }}
    >
      <div className="mb-3 flex items-center gap-2.5">
        {pick.project.icon && <img src={pick.project.icon} alt="" className="h-7 w-7 rounded-[22%] object-cover" />}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white/90">{pick.project.title}</div>
          <div className="text-xs text-white/50">
            {pick.date.slice(0, 4)}/{shortDate(pick.date)}({weekday}){pick.count > 0 && ` · ${pick.count} コミット`}
          </div>
        </div>
      </div>
      {pick.logs.length > 0 ? (
        <ul className="space-y-1.5">
          {pick.logs.map((log) => (
            <li key={log.slug}>
              <Link
                to={`/devlog/${log.slug}`}
                className="group flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 transition-colors hover:border-white/30 hover:bg-white/[0.08]"
              >
                <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-white/90">{log.title}</span>
                <span className="shrink-0 text-white/40 transition-colors group-hover:text-white/80">→</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-white/45">この日のログはまだありません</p>
      )}
    </div>
  );
}
