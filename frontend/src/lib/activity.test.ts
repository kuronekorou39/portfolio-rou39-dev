import { describe, expect, it } from 'vitest';
import { assignLanes, dateRange, goalStatus, toStreaks } from './activity';

describe('toStreaks', () => {
  it('空きが maxGap 日までなら 1 つの期間にまとめる', () => {
    const days = { '2026-10-09': 2, '2026-10-12': 1, '2026-10-16': 4 };
    expect(toStreaks(days, 2)).toEqual([
      { start: '2026-10-09', end: '2026-10-12', workDays: 2, commits: 3 },
      { start: '2026-10-16', end: '2026-10-16', workDays: 1, commits: 4 },
    ]);
  });
});

describe('goalStatus', () => {
  const goal = { project: 'a', title: 't', start: '2026-11-10', due: '2026-11-20' };

  it('着手前・進行中・超過を見分ける', () => {
    expect(goalStatus(goal, '2026-11-08').state).toBe('planned');
    expect(goalStatus(goal, '2026-11-17')).toMatchObject({ state: 'active', text: '残り 3 日' });
    expect(goalStatus(goal, '2026-11-20').text).toBe('今日が期限');
    expect(goalStatus(goal, '2026-11-22')).toMatchObject({ state: 'overdue', lateDays: 2 });
  });

  it('終えた日が期限より後なら遅れとして数える', () => {
    expect(goalStatus({ ...goal, done: '2026-11-19' }, '2026-12-01').state).toBe('done');
    expect(goalStatus({ ...goal, done: '2026-11-23' }, '2026-12-01')).toMatchObject({ state: 'done-late', lateDays: 3 });
  });
});

describe('assignLanes', () => {
  it('重なる期間は別の段に、重ならなければ同じ段に置く', () => {
    const lanes = assignLanes([
      { start: '2026-11-01', end: '2026-11-10' },
      { start: '2026-11-05', end: '2026-11-12' },
      { start: '2026-11-11', end: '2026-11-15' },
    ]);
    expect(lanes).toEqual([0, 1, 0]);
  });
});

describe('dateRange', () => {
  it('両端を含む', () => {
    expect(dateRange('2026-10-30', '2026-11-01')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });
});
