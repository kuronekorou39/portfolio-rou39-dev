import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchProjects } from '@/lib/api';
import { dateRange, fetchActivity, type Activity } from '@/lib/activity';
import { localToday } from '@/lib/devlogActivity';
import { fetchPostIndex, type PostMeta } from '@/lib/posts';
import { categoryEmoji } from '@/data/mockProjects';
import type { Project } from '../../../shared/src/types';
import PageBackground from '@/components/PageBackground';

// 横に並べる日数。約 4 か月
const TIMELINE_DAYS = 120;
// 1 日のマスの一辺(px)。日付の数字 2 桁が入る最小
const CELL = 18;
const GAP = 3;
const NAME_WIDTH = 168;

// 1 色の濃淡で量を表す。段の境目はコミット件数
const LEVELS = [
  { min: 10, color: 'rgb(96,165,250)', label: '10+' },
  { min: 6, color: 'rgba(96,165,250,0.78)', label: '6〜9' },
  { min: 3, color: 'rgba(96,165,250,0.55)', label: '3〜5' },
  { min: 1, color: 'rgba(96,165,250,0.32)', label: '1〜2' },
];
const EMPTY_COLOR = 'rgba(255,255,255,0.05)';
const cellColor = (count: number) => LEVELS.find((l) => count >= l.min)?.color ?? EMPTY_COLOR;

const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const dayOfWeek = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

export default function TimelinePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [posts, setPosts] = useState<PostMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

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
  const dates = useMemo(() => dateRange(today, TIMELINE_DAYS), [today]);

  // アプリ id → 日付 → その日のログ
  const logs = useMemo(() => {
    const map = new Map<string, Map<string, PostMeta>>();
    for (const post of posts) {
      for (const id of post.projects) {
        if (!map.has(id)) map.set(id, new Map());
        map.get(id)!.set(post.date, post);
      }
    }
    return map;
  }, [posts]);

  // 最近動いたアプリを上に。期間内に動きが無いアプリも行は出す(止まっていることも情報)
  const rows = useMemo(() => {
    const from = dates[0];
    return projects
      .map((project) => {
        const days = activity?.apps[project.id] ?? {};
        const active = Object.keys(days).filter((d) => d >= from && d <= today).sort();
        return { project, days, activeDays: active.length, last: active.at(-1) ?? '' };
      })
      .sort((a, b) => b.last.localeCompare(a.last) || a.project.title.localeCompare(b.project.title));
  }, [projects, activity, dates, today]);

  // 開いたときは今日(右端)を見せる
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [rows.length]);

  const gridWidth = dates.length * (CELL + GAP);

  return (
    <div className="relative isolate min-h-screen bg-[#060608] text-white">
      <PageBackground />
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h1 className="mb-3 text-5xl font-black tracking-tight md:text-6xl">Timeline</h1>
        <p className="mb-10 text-lg text-white/40">アプリごとの、作業のあった日</p>

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
              className="overflow-x-auto rounded-2xl border border-white/[0.12] bg-[#0b0c10]/75 py-5 backdrop-blur-md"
            >
              <div style={{ width: NAME_WIDTH + gridWidth + 20 }}>
                {/* 月と日 */}
                <div className="mb-2 mt-5 flex items-end">
                  <div className="sticky left-0 z-10 shrink-0 bg-[#0b0c10]" style={{ width: NAME_WIDTH }} />
                  <div className="flex" style={{ gap: GAP }}>
                    {dates.map((date, i) => {
                      const day = Number(date.slice(8, 10));
                      const dow = dayOfWeek(date);
                      return (
                        <div key={date} className="relative text-center" style={{ width: CELL }}>
                          {(day === 1 || i === 0) && (
                            <div className="absolute bottom-full left-0 mb-1 whitespace-nowrap text-[11px] font-semibold text-white/70">
                              {Number(date.slice(5, 7))}月
                            </div>
                          )}
                          <div
                            className={`text-[9px] leading-none ${
                              date === today ? 'font-bold text-white' : dow === 0 || dow === 6 ? 'text-white/25' : 'text-white/45'
                            }`}
                          >
                            {day}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {rows.map(({ project, days, activeDays }) => (
                  <div key={project.id} className="flex items-center" style={{ marginTop: GAP }}>
                    <Link
                      to={`/apps/${project.id}`}
                      className="sticky left-0 z-10 flex shrink-0 items-center gap-2 bg-[#0b0c10] py-1 pl-5 pr-3 text-white/80 transition-colors hover:text-white"
                      style={{ width: NAME_WIDTH }}
                    >
                      {project.icon ? (
                        <img src={project.icon} alt="" className="h-6 w-6 shrink-0 rounded-md border border-white/10 object-cover" loading="lazy" />
                      ) : (
                        <span className="shrink-0 text-lg">{categoryEmoji[project.category]}</span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold">{project.title}</span>
                        <span className="block text-[10px] text-white/40">{activeDays} 日</span>
                      </span>
                    </Link>
                    <div className="flex" style={{ gap: GAP }}>
                      {dates.map((date) => {
                        const count = days[date] ?? 0;
                        const log = logs.get(project.id)?.get(date);
                        const label = `${shortDate(date)} ${count > 0 ? `${count} コミット` : '作業なし'}${log ? ` / ログ: ${log.title}` : ''}`;
                        const style = { width: CELL, height: CELL, background: cellColor(count) };
                        // ログのある日は白い枠で示し、押すとそのログを開く
                        return log ? (
                          <Link
                            key={date}
                            to={`/devlog/${log.slug}`}
                            title={label}
                            aria-label={label}
                            className="shrink-0 rounded-[4px] outline outline-2 -outline-offset-2 outline-white/90 transition-transform hover:scale-125"
                            style={style}
                          />
                        ) : (
                          <div key={date} title={label} className="shrink-0 rounded-[4px]" style={style} />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 凡例 */}
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/50">
              <span className="flex items-center gap-1.5">
                コミット
                {[...LEVELS].reverse().map((level) => (
                  <span key={level.label} className="flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded-[3px]" style={{ background: level.color }} />
                    {level.label}
                  </span>
                ))}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-[3px] outline outline-2 -outline-offset-2 outline-white/90" />
                ログあり(押すと開く)
              </span>
              <span className="ml-auto text-white/35">{shortDate(activity.updatedAt)} 時点</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
