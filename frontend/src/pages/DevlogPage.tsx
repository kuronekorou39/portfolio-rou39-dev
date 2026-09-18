import { Link } from 'react-router-dom';
import { posts } from '@/lib/posts';

// 月ごとに区切る。日次で増えていくので、区切りが無いと日付の列が読みにくい
function groupByMonth(): { month: string; items: typeof posts }[] {
  const groups: { month: string; items: typeof posts }[] = [];
  for (const post of posts) {
    const month = post.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last?.month === month) last.items.push(post);
    else groups.push({ month, items: [post] });
  }
  return groups;
}

export default function DevlogPage() {
  const groups = groupByMonth();

  return (
    <div className="min-h-screen bg-[#060608] text-white">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="mb-3 text-5xl font-black tracking-tight md:text-6xl">Devlog</h1>
        <p className="mb-14 text-lg text-white/40">開発の記録。1日1件、その日に進んだことを書く</p>

        {groups.length === 0 ? (
          <p className="py-20 text-center text-white/40">まだ記事がありません</p>
        ) : (
          groups.map(({ month, items }) => (
            <section key={month} className="mb-12">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-white/30">
                {month.replace('-', ' / ')}
              </h2>
              <ul className="border-t border-white/[0.06]">
                {items.map((post) => (
                  <li key={post.slug} className="border-b border-white/[0.06]">
                    <Link
                      to={`/devlog/${post.slug}`}
                      className="group flex gap-6 py-5 transition-colors hover:bg-white/[0.02]"
                    >
                      <time dateTime={post.date} className="w-12 shrink-0 pt-0.5 text-sm tabular-nums text-white/30">
                        {post.date.slice(5).replace('-', '/')}
                      </time>
                      <div className="min-w-0">
                        <h3 className="font-bold text-white/85 transition-colors group-hover:text-white">
                          {post.title}
                        </h3>
                        {post.summary && <p className="mt-1 text-sm text-white/45">{post.summary}</p>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
