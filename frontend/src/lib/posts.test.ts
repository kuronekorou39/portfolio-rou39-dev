import { describe, expect, it } from 'vitest';
import { parsePost, sortPosts } from './posts';

const SOURCE = `---
title: 作品一覧を現状に合わせた
summary: 5件追加した
projects: [vloom, "hayabuzz"]
---

本文の1行目。

## 見出し
`;

describe('parsePost', () => {
  it('frontmatter と本文を分けて読む', () => {
    const post = parsePost('../../../data/posts/2026-09-18-apps-refresh.md', SOURCE);
    expect(post).toEqual({
      slug: '2026-09-18-apps-refresh',
      title: '作品一覧を現状に合わせた',
      date: '2026-09-18',
      summary: '5件追加した',
      projects: ['vloom', 'hayabuzz'],
      body: '本文の1行目。\n\n## 見出し',
    });
  });

  it('CRLF の改行でも読める', () => {
    const post = parsePost('data/posts/2026-09-18-a.md', SOURCE.replace(/\n/g, '\r\n'));
    expect(post?.title).toBe('作品一覧を現状に合わせた');
    expect(post?.body).toBe('本文の1行目。\n\n## 見出し');
  });

  it('日付はファイル名を正とする', () => {
    const post = parsePost('data/posts/2026-09-18-a.md', '---\ntitle: t\ndate: 1999-01-01\n---\nx');
    expect(post?.date).toBe('2026-09-18');
  });

  it('title にコロンが入っていても切れない', () => {
    const post = parsePost('data/posts/2026-09-18-a.md', '---\ntitle: Vloom: 光で渡す\n---\nx');
    expect(post?.title).toBe('Vloom: 光で渡す');
  });

  it('ファイル名が形式に合わない・frontmatter が無い・title が無いものは記事にしない', () => {
    expect(parsePost('data/posts/README.md', SOURCE)).toBeNull();
    expect(parsePost('data/posts/2026-09-18-a.md', '本文だけ')).toBeNull();
    expect(parsePost('data/posts/2026-09-18-a.md', '---\nsummary: s\n---\nx')).toBeNull();
  });
});

describe('sortPosts', () => {
  it('新しい順に並べ、同じ日付は slug で固定する', () => {
    const make = (slug: string, date: string) => ({ slug, date, title: '', summary: '', projects: [], body: '' });
    const sorted = sortPosts([make('b', '2026-09-17'), make('z', '2026-09-18'), make('a', '2026-09-18')]);
    expect(sorted.map((p) => p.slug)).toEqual(['a', 'z', 'b']);
  });
});
