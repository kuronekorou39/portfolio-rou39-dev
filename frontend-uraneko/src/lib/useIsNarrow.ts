import { useEffect, useState } from 'react';

const DEFAULT_BREAKPOINT = 720;

/**
 * スマホ幅(既定 720px 以下)かどうかを返す。
 * 本サイトはインライン style 主体で @media が使えないため、
 * 固定カラムのグリッドを畳む用途にこのフックを使う。
 */
export function useIsNarrow(breakpoint = DEFAULT_BREAKPOINT): boolean {
  const [narrow, setNarrow] = useState(
    () => window.matchMedia(`(max-width: ${breakpoint}px)`).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [breakpoint]);
  return narrow;
}
