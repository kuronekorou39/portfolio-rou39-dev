// 開発ログ(Devlog)。正本は data/posts/*.md で、scripts/content/build-content.mjs が
// 検査して /content/devlog/ に配信用のファイルを書き出す。サイトはそれを実行時に読む。
// ビルドに焼き込まないので、ログの追加にサイトの再ビルドは要らない。形式は docs/devlog.md。

export interface PostMeta {
  /** URL に使う識別子。ファイル名から拡張子を除いたもの (例: 2026-09-07-vloom-pwa-receive) */
  slug: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  summary: string;
  /** 関連するアプリの id (data/projects.json の id) */
  projects: string[];
  /** 本文の最初の画像。一覧の見出し画像に使う。無ければ null */
  image: string | null;
}

const BASE = '/content/devlog';

// 一覧と記事を行き来しても取り直さないよう、ページを開いている間は持っておく
let indexPromise: Promise<PostMeta[]> | null = null;
const bodies = new Map<string, Promise<string>>();

async function get(url: string): Promise<Response> {
  const res = await fetch(url);
  // SPA のフォールバックで、存在しないパスにも index.html が 200 で返ることがある
  if (!res.ok || res.headers.get('content-type')?.includes('text/html')) throw new Error(`failed to load ${url}`);
  return res;
}

/** 全ログのメタ情報。新しい順 */
export function fetchPostIndex(): Promise<PostMeta[]> {
  indexPromise ??= get(`${BASE}/index.json`)
    .then((res) => res.json() as Promise<PostMeta[]>)
    .catch((err) => {
      indexPromise = null;
      throw err;
    });
  return indexPromise;
}

/** 1 本の本文 (Markdown)。frontmatter は含まない */
export function fetchPostBody(slug: string): Promise<string> {
  let body = bodies.get(slug);
  if (!body) {
    body = get(`${BASE}/posts/${encodeURIComponent(slug)}.md`)
      .then((res) => res.text())
      .catch((err) => {
        bodies.delete(slug);
        throw err;
      });
    bodies.set(slug, body);
  }
  return body;
}
