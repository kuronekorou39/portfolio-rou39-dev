// 日時整形。保存は ISO(UTC)のまま、表示だけ日本時間(JST)に固定する。
// 閲覧者のブラウザTZに依存させず、常に日本時間で表示する(日本の事業のため)。
export function fmtJst(iso: string, opts?: { dateOnly?: boolean }): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(opts?.dateOnly ? {} : { hour: '2-digit', minute: '2-digit' }),
  });
}
