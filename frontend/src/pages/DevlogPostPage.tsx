import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchProjects } from '@/lib/api';
import { fetchPostBody, fetchPostIndex, type PostMeta } from '@/lib/posts';
import PageBackground from '@/components/PageBackground';
import type { Project } from '../../../shared/src/types';

type State =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; posts: PostMeta[]; post: PostMeta; body: string };

export default function DevlogPostPage() {
  const { slug = '' } = useParams();
  const [state, setState] = useState<State>({ status: 'loading' });
  // 関連アプリは id で持っているので、表示名だけ API から引く。引けなくても id で出せる
  const [apps, setApps] = useState<Record<string, Pick<Project, 'title' | 'icon'>>>({});

  useEffect(() => {
    let alive = true;
    fetchPostIndex()
      .then(async (posts) => {
        const post = posts.find((p) => p.slug === slug);
        if (!post) return { status: 'missing' } as const;
        return { status: 'ready', posts, post, body: await fetchPostBody(slug) } as const;
      })
      .catch(() => ({ status: 'missing' }) as const)
      .then((next) => alive && setState(next));
    return () => {
      alive = false;
    };
  }, [slug]);

  const hasProjects = state.status === 'ready' && state.post.projects.length > 0;
  useEffect(() => {
    if (!hasProjects) return;
    fetchProjects()
      .then((all) => setApps(Object.fromEntries(all.map((p) => [p.id, p]))))
      .catch(() => {});
  }, [hasProjects]);

  // 前後のログへ移ったとき、読み込みが終わるまでは前の本文を出したままにする(白く抜けない)
  if (state.status !== 'ready') {
    return (
      <div className="relative isolate min-h-screen bg-[#060608] text-white">
        <PageBackground />
        <div className="mx-auto max-w-3xl px-6 py-32 text-center">
          {state.status === 'loading' ? (
            <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-white/50" />
          ) : (
            <>
              <p className="mb-6 text-white/50">ログが見つかりません</p>
              <Link to="/devlog" className="text-sm text-white/60 underline underline-offset-4 hover:text-white">
                Devlog へ戻る
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  const { posts, post, body } = state;
  // posts は新しい順。前のログ = より古いログ
  const index = posts.indexOf(post);
  const newer = posts[index - 1];
  const older = posts[index + 1];

  return (
    <div className="relative isolate min-h-screen bg-[#060608] text-white">
      <PageBackground />
      <article className="mx-auto max-w-3xl px-6 py-16">
        <Link to="/devlog" className="text-sm text-white/60 transition-colors hover:text-white">
          ← Devlog
        </Link>

        <header className="mb-10 mt-8 border-b border-white/10 pb-8">
          {/* 日付を押すと、その日のログの一覧へ */}
          <Link to={`/devlog?date=${post.date}`} className="text-sm tabular-nums text-white/60 transition-colors hover:text-white">
            <time dateTime={post.date}>{post.date.replace(/-/g, '/')}</time>
          </Link>
          <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">{post.title}</h1>
          {post.projects.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {post.projects.map((id) => (
                <Link
                  key={id}
                  to={`/devlog?app=${id}`}
                  className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.05] py-1 pl-1 pr-3.5 text-sm text-white/85 transition-colors hover:border-white/35 hover:text-white"
                >
                  {apps[id]?.icon && <img src={apps[id].icon} alt="" className="h-7 w-7 rounded-[22%] object-cover" />}
                  {apps[id]?.title ?? id}
                  <span className="text-xs text-white/50">のログ</span>
                </Link>
              ))}
            </div>
          )}
        </header>

        <div className="selectable md-content">
          <Markdown remarkPlugins={[remarkGfm]}>{body}</Markdown>
        </div>

        {(newer || older) && (
          <nav className="mt-16 grid gap-4 border-t border-white/10 pt-8 sm:grid-cols-2">
            {older ? (
              <Link to={`/devlog/${older.slug}`} className="group">
                <span className="text-xs text-white/50">← 前のログ</span>
                <span className="mt-1 block text-sm text-white/85 transition-colors group-hover:text-white">{older.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {newer && (
              <Link to={`/devlog/${newer.slug}`} className="group sm:text-right">
                <span className="text-xs text-white/50">次のログ →</span>
                <span className="mt-1 block text-sm text-white/85 transition-colors group-hover:text-white">{newer.title}</span>
              </Link>
            )}
          </nav>
        )}
      </article>
    </div>
  );
}
