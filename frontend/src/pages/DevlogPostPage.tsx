import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import { fetchProjects } from '@/lib/api';
import { findPost, posts } from '@/lib/posts';
import PageBackground from '@/components/PageBackground';

export default function DevlogPostPage() {
  const { slug = '' } = useParams();
  const post = findPost(slug);
  // 関連作品は id で持っているので、表示名だけ API から引く。引けなくても id で出せる
  const [titles, setTitles] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!post || post.projects.length === 0) return;
    fetchProjects()
      .then((all) => setTitles(Object.fromEntries(all.map((p) => [p.id, p.title]))))
      .catch(() => {});
  }, [post]);

  if (!post) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-32 text-center text-white">
        <p className="mb-6 text-white/50">記事が見つかりません</p>
        <Link to="/devlog" className="text-sm text-white/60 underline underline-offset-4 hover:text-white">
          Devlog へ戻る
        </Link>
      </div>
    );
  }

  // posts は新しい順。前の記事 = より古い記事
  const index = posts.indexOf(post);
  const newer = posts[index - 1];
  const older = posts[index + 1];

  return (
    <div className="relative isolate min-h-screen bg-[#060608] text-white">
      <PageBackground />
      <article className="mx-auto max-w-3xl px-6 py-16">
        <Link to="/devlog" className="text-sm text-white/40 transition-colors hover:text-white/80">
          ← Devlog
        </Link>

        <header className="mb-10 mt-8 border-b border-white/[0.06] pb-8">
          <time dateTime={post.date} className="text-sm tabular-nums text-white/40">
            {post.date.replace(/-/g, '/')}
          </time>
          <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">{post.title}</h1>
          {post.projects.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {post.projects.map((id) => (
                <Link
                  key={id}
                  to={`/apps/${id}`}
                  className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/55 transition-colors hover:border-white/30 hover:text-white"
                >
                  {titles[id] ?? id}
                </Link>
              ))}
            </div>
          )}
        </header>

        <div className="selectable md-content">
          <Markdown>{post.body}</Markdown>
        </div>

        {(newer || older) && (
          <nav className="mt-16 grid gap-4 border-t border-white/[0.06] pt-8 sm:grid-cols-2">
            {older ? (
              <Link to={`/devlog/${older.slug}`} className="group">
                <span className="text-xs text-white/30">← 前の記事</span>
                <span className="mt-1 block text-sm text-white/60 transition-colors group-hover:text-white">{older.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {newer && (
              <Link to={`/devlog/${newer.slug}`} className="group sm:text-right">
                <span className="text-xs text-white/30">次の記事 →</span>
                <span className="mt-1 block text-sm text-white/60 transition-colors group-hover:text-white">{newer.title}</span>
              </Link>
            )}
          </nav>
        )}
      </article>
    </div>
  );
}
