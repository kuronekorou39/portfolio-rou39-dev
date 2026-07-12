import { useEffect, useState, useCallback } from 'react';

/**
 * 要素が画面に入ったら一度だけ true になるフック(IntersectionObserver)。
 * 「読み込み時のマウント直後」ではなく「スクロールで見えた時」にアニメーションを
 * 再生させるために使う(ファーストビュー外の要素でも必ず動きが見える)。
 *
 * 条件レンダリング(データ取得後に出る要素)にも対応するため、ref はコールバック方式。
 * 使い方:
 *   const [ref, inView] = useInView();
 *   <div ref={ref}>{inView && ...}</div>
 */
export function useInView(rootMargin = '0px 0px -10% 0px'): [(node: Element | null) => void, boolean] {
  const [node, setNode] = useState<Element | null>(null);
  const [inView, setInView] = useState(false);
  const ref = useCallback((n: Element | null) => setNode(n), []);

  useEffect(() => {
    if (!node) return;
    // IntersectionObserver 非対応環境では常に表示(アニメ無しで安全側)
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [node, rootMargin]);

  return [ref, inView];
}
