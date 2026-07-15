import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ルート遷移のたびにページ最上部へ戻す。
 * SPA はページを切り替えてもウィンドウのスクロール位置が継続するため、
 * 前ページの途中位置のまま新ページが表示されてしまうのを防ぐ。
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
