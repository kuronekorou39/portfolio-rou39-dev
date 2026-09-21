// Devlog 一覧の「直近の活動」を作る。日付は YYYY-MM-DD の文字列のまま扱い、
// 計算だけ UTC の Date を使う(ローカルのタイムゾーンで日付がずれないように)。
import type { PostMeta } from './posts';

export interface DayCell {
  date: string;
  /** その日の記事。0 件なら空 */
  posts: PostMeta[];
  /** 今日より先の日。週の途中で今日が来るので、最後の列にだけ出る */
  future: boolean;
}

const DAY_MS = 86_400_000;

const toUtc = (date: string): number => Date.parse(`${date}T00:00:00Z`);
const toDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** ローカルの今日を YYYY-MM-DD で返す */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * 今日を含む週を最後の列にして、weeks 週ぶんのカレンダーを返す。
 * 列 = 週(月曜始まり)、行 = 曜日。
 */
export function buildCalendar(posts: PostMeta[], today: string, weeks: number): DayCell[][] {
  const byDate = new Map<string, PostMeta[]>();
  for (const post of posts) byDate.set(post.date, [...(byDate.get(post.date) ?? []), post]);

  const todayMs = toUtc(today);
  // getUTCDay は日曜 = 0。月曜始まりに直す
  const weekday = (new Date(todayMs).getUTCDay() + 6) % 7;
  const firstMonday = todayMs - weekday * DAY_MS - (weeks - 1) * 7 * DAY_MS;

  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const ms = firstMonday + (w * 7 + d) * DAY_MS;
      const date = toDate(ms);
      return { date, posts: byDate.get(date) ?? [], future: ms > todayMs };
    }),
  );
}

/** 期間内の記事をアプリごとに数え、多い順に返す。同数なら id 順で固定する */
export function countByProject(posts: PostMeta[], from: string, to: string): { id: string; count: number }[] {
  const count = new Map<string, number>();
  for (const post of posts) {
    if (post.date < from || post.date > to) continue;
    for (const id of post.projects) count.set(id, (count.get(id) ?? 0) + 1);
  }
  return [...count.entries()]
    .map(([id, n]) => ({ id, count: n }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}
