// タイムライン(/timeline)の材料。アプリごと・日ごとのコミット件数。
// 正本は data/activity.json(npm run activity が集める)で、Devlog と同じく実行時に読む。

export interface Activity {
  /** 最後に集めた日。YYYY-MM-DD */
  updatedAt: string;
  /** アプリの id → 日付(YYYY-MM-DD)→ その日のコミット件数 */
  apps: Record<string, Record<string, number>>;
}

let promise: Promise<Activity> | null = null;

export function fetchActivity(): Promise<Activity> {
  promise ??= fetch('/content/devlog/activity.json')
    .then((res) => {
      // SPA のフォールバックで、存在しないパスにも index.html が 200 で返ることがある
      if (!res.ok || res.headers.get('content-type')?.includes('text/html')) throw new Error('failed to load activity');
      return res.json() as Promise<Activity>;
    })
    .catch((err) => {
      promise = null;
      throw err;
    });
  return promise;
}

/** to を含めて days 日ぶんの日付(YYYY-MM-DD)を古い順に返す */
export function dateRange(to: string, days: number): string[] {
  const end = Date.parse(`${to}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}
