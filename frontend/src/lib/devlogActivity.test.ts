import { describe, expect, it } from 'vitest';
import { buildCalendar, countByProject } from './devlogActivity';
import type { Post } from './posts';

const post = (date: string, projects: string[] = ['vloom']): Post => ({
  slug: `${date}-x`, title: '', date, summary: '', projects, image: null, body: '',
});

describe('buildCalendar', () => {
  // 2026-09-19 は土曜
  const calendar = buildCalendar([post('2026-09-19'), post('2026-09-19'), post('2026-09-07')], '2026-09-19', 3);

  it('月曜始まりの週を、今日を含む週が最後になるように並べる', () => {
    expect(calendar).toHaveLength(3);
    expect(calendar[0][0].date).toBe('2026-08-31');
    expect(calendar[2][0].date).toBe('2026-09-14');
    expect(calendar[2][6].date).toBe('2026-09-20');
  });

  it('その日の記事を入れ、今日より先の日に印を付ける', () => {
    expect(calendar[2][5].posts).toHaveLength(2);
    expect(calendar[1][0].posts).toHaveLength(1);
    expect(calendar[2][5].future).toBe(false);
    expect(calendar[2][6].future).toBe(true);
  });
});

describe('countByProject', () => {
  it('期間内だけを数え、多い順・同数は id 順に並べる', () => {
    const posts = [
      post('2026-09-01', ['vloom']), post('2026-09-02', ['vloom']),
      post('2026-09-03', ['hayabuzz']), post('2026-09-03', ['easy-blur']),
      post('2026-05-01', ['vloom']),
    ];
    expect(countByProject(posts, '2026-06-01', '2026-09-19')).toEqual([
      { id: 'vloom', count: 2 }, { id: 'easy-blur', count: 1 }, { id: 'hayabuzz', count: 1 },
    ]);
  });
});
