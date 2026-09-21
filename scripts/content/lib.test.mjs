// node --test scripts/content/
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parsePost, sortPosts, validatePost } from './lib.mjs';

const SOURCE = `---
title: Vloom: 光で渡す
summary: 5件追加した
projects: [vloom, "hayabuzz"]
---

本文の1行目。

![図1](/devlog/a/one.svg)

![図2](/devlog/a/two.png)
`;

describe('parsePost', () => {
  it('frontmatter と本文を分け、最初の画像を見出し画像として拾う', () => {
    assert.deepEqual(parsePost('2026-09-18-vloom-light.md', SOURCE), {
      slug: '2026-09-18-vloom-light',
      title: 'Vloom: 光で渡す',
      date: '2026-09-18',
      summary: '5件追加した',
      projects: ['vloom', 'hayabuzz'],
      image: '/devlog/a/one.svg',
      body: '本文の1行目。\n\n![図1](/devlog/a/one.svg)\n\n![図2](/devlog/a/two.png)',
    });
  });

  it('CRLF の改行でも読める', () => {
    assert.equal(parsePost('2026-09-18-a.md', SOURCE.replace(/\n/g, '\r\n'))?.title, 'Vloom: 光で渡す');
  });

  it('日付はファイル名を正とする', () => {
    assert.equal(parsePost('2026-09-18-a.md', '---\ntitle: t\ndate: 1999-01-01\n---\nx')?.date, '2026-09-18');
  });

  it('ファイル名が形式に合わない・frontmatter が無い・title が無いものは記事にしない', () => {
    assert.equal(parsePost('README.md', SOURCE), null);
    assert.equal(parsePost('2026-09-18-a.md', '本文だけ'), null);
    assert.equal(parsePost('2026-09-18-a.md', '---\nsummary: s\n---\nx'), null);
  });
});

describe('sortPosts', () => {
  it('新しい順に並べ、同じ日付は slug で固定する', () => {
    const make = (slug, date) => ({ slug, date });
    assert.deepEqual(sortPosts([make('b', '2026-09-17'), make('z', '2026-09-18'), make('a', '2026-09-18')]).map((p) => p.slug), ['a', 'z', 'b']);
  });
});

describe('validatePost', () => {
  const context = { projectIds: new Set(['vloom']), imageExists: (url) => url === '/devlog/a/one.svg' };
  const make = (patch = {}) => ({
    slug: '2026-09-18-a', title: 'Vloom: t', date: '2026-09-18', summary: '要約', projects: ['vloom'],
    image: '/devlog/a/one.svg', body: `${'あ'.repeat(300)}\n\n![図](/devlog/a/one.svg)`, ...patch,
  });

  it('ルールどおりなら問題なし', () => {
    assert.deepEqual(validatePost(make(), context), []);
  });

  it('図が無い・未掲載のアプリ・実在しない画像を止める', () => {
    assert.match(validatePost(make({ image: null, body: 'あ'.repeat(300) }), context).join(), /図が無い/);
    assert.match(validatePost(make({ projects: ['secret-app'] }), context).join(), /未掲載: secret-app/);
    assert.match(validatePost(make({ body: `${'あ'.repeat(300)}\n\n![図](/devlog/a/none.svg)` }), context).join(), /画像が無い/);
  });

  it('画像の行は字数に数えない', () => {
    const body = `${'あ'.repeat(590)}\n\n![とても長い題の図](/devlog/a/one.svg)`;
    assert.deepEqual(validatePost(make({ body }), context), []);
    assert.match(validatePost(make({ body: `${'あ'.repeat(700)}\n\n![図](/devlog/a/one.svg)` }), context).join(), /本文が長い/);
  });

  it('外に出せない文字列と、決めた言葉づかいの違反を止める', () => {
    const withText = (text) => validatePost(make({ body: `${text}${'あ'.repeat(300)}\n\n![図](/devlog/a/one.svg)` }), context).join();
    assert.match(withText('C:\\projects\\x を見た。'), /絶対パス/);
    assert.match(withText('連絡は someone@example.com まで。'), /メールアドレス/);
    assert.match(withText('この作品を直した。'), /「作品」/);
    assert.equal(withText('Prime Video の作品ページを見た。'), '');
    assert.match(withText('直しました。'), /です・ます調/);
  });
});
