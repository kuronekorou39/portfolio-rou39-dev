// 開発ログ(Devlog)の記事。正本は data/posts/*.md で、ビルド時に取り込む。
// 形式は docs/devlog.md を参照。

export interface Post {
  /** URL に使う識別子。ファイル名から拡張子を除いたもの (例: 2026-09-18-apps-refresh) */
  slug: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  summary: string;
  /** 関連するアプリの id (data/projects.json の id) */
  projects: string[];
  /** 本文の最初の画像。一覧の見出し画像に使う。無ければ null */
  image: string | null;
  body: string;
}

// ファイル名は「日付-スラッグ.md」。これに合わないファイルは記事として扱わない
const POST_FILE = /(\d{4}-\d{2}-\d{2})-[a-z0-9-]+\.md$/;

function parseValue(raw: string): string | string[] {
  const value = raw.trim();
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((v) => v.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  return value.replace(/^["']|["']$/g, '');
}

/** 先頭の `---` で囲まれた `key: value` を読む。YAML の全機能は要らないので自前で足りる */
export function parsePost(path: string, source: string): Post | null {
  const file = POST_FILE.exec(path.replace(/\\/g, '/'));
  if (!file) return null;

  const text = source.replace(/\r\n/g, '\n');
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!fm) return null;

  const meta: Record<string, string | string[]> = {};
  for (const line of fm[1].split('\n')) {
    const sep = line.indexOf(':');
    if (sep <= 0) continue;
    meta[line.slice(0, sep).trim()] = parseValue(line.slice(sep + 1));
  }

  const title = meta.title;
  if (typeof title !== 'string' || !title) return null;

  const body = text.slice(fm[0].length).trim();

  return {
    slug: path.replace(/\\/g, '/').split('/').pop()!.replace(/\.md$/, ''),
    title,
    // 日付はファイル名を正とする。frontmatter と食い違っても並び順が壊れない
    date: file[1],
    summary: typeof meta.summary === 'string' ? meta.summary : '',
    projects: Array.isArray(meta.projects) ? meta.projects : [],
    image: /!\[[^\]]*\]\(([^)\s]+)\)/.exec(body)?.[1] ?? null,
    body,
  };
}

/** 新しい順。同じ日付の中では slug で並びを固定する */
export function sortPosts(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

const sources = import.meta.glob<string>('../../../data/posts/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export const posts: Post[] = sortPosts(
  Object.entries(sources)
    .map(([path, source]) => parsePost(path, source))
    .filter((p): p is Post => p !== null),
);

export function findPost(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}
