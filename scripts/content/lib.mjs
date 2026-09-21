// Devlog の記事 (data/posts/*.md) を読んで検査する。ルールの正本は docs/devlog.md。
// build-content.mjs(生成)と lib.test.mjs(テスト)から使う。

// ファイル名は「日付-スラッグ.md」。これに合わないファイルは記事として扱わない
const POST_FILE = /^(\d{4}-\d{2}-\d{2})-[a-z0-9-]+\.md$/;
const IMAGE = /!\[[^\]]*\]\(([^)\s]+)\)/;

const BODY_MIN = 200;
const BODY_MAX = 600;
const SUMMARY_MAX = 70;

// 公開されるので、外に出せない形の文字列は載せる前に止める
const FORBIDDEN = [
  [/[A-Za-z]:\\/, 'ローカルの絶対パス'],
  [/\/Users\/|\/c\/projects/i, 'ローカルの絶対パス'],
  [/[\w.+-]+@[\w-]+\.[\w.]+/, 'メールアドレス'],
  [/(sk-|ghp_|gho_|github_pat_|AKIA|ASIA)[-_A-Za-z0-9]{12,}/, 'トークンらしき文字列'],
];

function parseValue(raw) {
  const value = raw.trim();
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1).split(',').map((v) => v.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  return value.replace(/^["']|["']$/g, '');
}

/**
 * 先頭の `---` で囲まれた `key: value` を読む。YAML の全機能は要らないので自前で足りる。
 * 記事として扱えないものは null。
 */
export function parsePost(fileName, source) {
  const file = POST_FILE.exec(fileName);
  if (!file) return null;

  const text = source.replace(/\r\n/g, '\n');
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!fm) return null;

  const meta = {};
  for (const line of fm[1].split('\n')) {
    const sep = line.indexOf(':');
    if (sep <= 0) continue;
    meta[line.slice(0, sep).trim()] = parseValue(line.slice(sep + 1));
  }
  if (typeof meta.title !== 'string' || !meta.title) return null;

  const body = text.slice(fm[0].length).trim();
  return {
    slug: fileName.replace(/\.md$/, ''),
    title: meta.title,
    // 日付はファイル名を正とする。frontmatter と食い違っても並び順が壊れない
    date: file[1],
    summary: typeof meta.summary === 'string' ? meta.summary : '',
    projects: Array.isArray(meta.projects) ? meta.projects : [],
    // 本文の最初の画像。一覧の見出し画像に使う
    image: IMAGE.exec(body)?.[1] ?? null,
    body,
  };
}

/** 新しい順。同じ日付の中では slug で並びを固定する */
export function sortPosts(posts) {
  return [...posts].sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

/**
 * docs/devlog.md のルールに照らして、問題を文字列の配列で返す(空なら合格)。
 * projectIds: 載せてよいアプリの id。imageExists: 画像のパスが実在するかを返す関数。
 */
export function validatePost(post, { projectIds, imageExists }) {
  const problems = [];
  if (!post.summary) problems.push('summary が無い');
  else if ([...post.summary].length > SUMMARY_MAX) problems.push(`summary が長い (${[...post.summary].length} 字)`);

  if (post.projects.length === 0) problems.push('projects が無い');
  for (const id of post.projects) if (!projectIds.has(id)) problems.push(`projects の id が未掲載: ${id}`);

  // 画像の行は字数に数えない(パスが長いだけで、読む量ではない)
  const length = [...post.body.replace(/^!\[[^\]]*\]\([^)]+\)$/gm, '')].length;
  if (length < BODY_MIN) problems.push(`本文が短い (${length} 字)`);
  if (length > BODY_MAX) problems.push(`本文が長い (${length} 字)`);

  if (!post.image) problems.push('図が無い(1 ログに図を 1 枚)');
  for (const match of post.body.matchAll(new RegExp(IMAGE, 'g'))) {
    if (!imageExists(match[1])) problems.push(`画像が無い: ${match[1]}`);
  }

  if (/です。|ます。|ました。/.test(post.body)) problems.push('です・ます調が混じっている');
  // 「作品ページ」(映画などのページ)は別の意味なので通す
  if (/作品(?!ページ)/.test(`${post.title}${post.summary}${post.body}`)) problems.push('「作品」と書いている(「アプリ」と書く)');

  const whole = `${post.title}\n${post.summary}\n${post.body}`;
  for (const [pattern, label] of FORBIDDEN) {
    const hit = pattern.exec(whole);
    if (hit) problems.push(`${label}: ${hit[0]}`);
  }
  return problems;
}
