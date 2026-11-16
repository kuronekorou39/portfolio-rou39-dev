// タイムライン(/timeline)の材料。アプリごと・日ごとのコミット件数(実績)と、目標(予定)。
// 正本は data/activity.json(npm run activity が集める)と data/goals.json(手で書く)で、
// Devlog と同じく実行時に読む。

export interface Goal {
  /** アプリの id */
  project: string;
  title: string;
  /** 着手する日。YYYY-MM-DD */
  start: string;
  /** 期限。YYYY-MM-DD */
  due: string;
  /** 終えた日。終えていなければ無い */
  done?: string;
}

export interface Activity {
  /** 最後に集めた日。YYYY-MM-DD */
  updatedAt: string;
  /** アプリの id → 日付(YYYY-MM-DD)→ その日のコミット件数 */
  apps: Record<string, Record<string, number>>;
  goals: Goal[];
}

let promise: Promise<Activity> | null = null;

export function fetchActivity(): Promise<Activity> {
  promise ??= fetch('/content/devlog/activity.json')
    .then(async (res) => {
      // SPA のフォールバックで、存在しないパスにも index.html が 200 で返ることがある
      if (!res.ok || res.headers.get('content-type')?.includes('text/html')) throw new Error('failed to load activity');
      const data = (await res.json()) as Partial<Activity>;
      return { updatedAt: data.updatedAt ?? '', apps: data.apps ?? {}, goals: data.goals ?? [] };
    })
    .catch((err) => {
      promise = null;
      throw err;
    });
  return promise;
}

const DAY_MS = 86_400_000;
const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** b が a の何日後か。前なら負 */
export const dayDiff = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY_MS);
export const addDays = (date: string, days: number) => new Date(toMs(date) + days * DAY_MS).toISOString().slice(0, 10);

/** from から to まで(両端を含む)の日付を古い順に返す */
export function dateRange(from: string, to: string): string[] {
  return Array.from({ length: dayDiff(from, to) + 1 }, (_, i) => addDays(from, i));
}

export interface Streak {
  start: string;
  end: string;
  /** コミットのあった日数 */
  workDays: number;
  commits: number;
}

/**
 * 作業のあった日を、ひと続きの期間にまとめる。
 * maxGap 日までの空きは同じ期間とみなす(土日を挟んだだけで細切れにしない)。
 */
export function toStreaks(days: Record<string, number>, maxGap: number): Streak[] {
  const streaks: Streak[] = [];
  for (const date of Object.keys(days).filter((d) => days[d] > 0).sort()) {
    const last = streaks.at(-1);
    if (last && dayDiff(last.end, date) <= maxGap + 1) {
      last.end = date;
      last.workDays += 1;
      last.commits += days[date];
    } else {
      streaks.push({ start: date, end: date, workDays: 1, commits: days[date] });
    }
  }
  return streaks;
}

export type GoalState = 'planned' | 'active' | 'overdue' | 'done' | 'done-late';

export interface GoalStatus {
  state: GoalState;
  /** 表に出す短い文 */
  text: string;
  /** 期限を過ぎた日数。過ぎていなければ 0 */
  lateDays: number;
}

/** 目標が今どの状態か。予定と実績を比べる土台 */
export function goalStatus(goal: Goal, today: string): GoalStatus {
  if (goal.done) {
    const late = Math.max(0, dayDiff(goal.due, goal.done));
    return late > 0
      ? { state: 'done-late', text: `完了(${late} 日遅れ)`, lateDays: late }
      : { state: 'done', text: '完了', lateDays: 0 };
  }
  if (today < goal.start) return { state: 'planned', text: `${dayDiff(today, goal.start)} 日後に着手`, lateDays: 0 };
  const left = dayDiff(today, goal.due);
  if (left < 0) return { state: 'overdue', text: `${-left} 日超過`, lateDays: -left };
  return { state: 'active', text: left === 0 ? '今日が期限' : `残り ${left} 日`, lateDays: 0 };
}

/** 期間が重なる目標を別の段に振り分ける。返すのは目標ごとの段の番号(0 始まり) */
export function assignLanes(goals: { start: string; end: string }[]): number[] {
  const laneEnds: string[] = [];
  const lanes = new Array<number>(goals.length);
  const order = goals.map((_, i) => i).sort((a, b) => goals[a].start.localeCompare(goals[b].start));
  for (const i of order) {
    let lane = laneEnds.findIndex((end) => end < goals[i].start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = goals[i].end;
    lanes[i] = lane;
  }
  return lanes;
}
