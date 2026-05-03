import { useRef } from 'react';
import { Link } from 'react-router-dom';

export default function RelationsPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  return (
    <div className="fixed inset-0 bg-[#eae6dd]" style={{ WebkitTapHighlightColor: 'transparent', WebkitUserSelect: 'none', userSelect: 'none' }}>
      <iframe
        ref={iframeRef}
        // 親URLのクエリを iframe にも引き継ぐ (e.g. ?data=t10 でデータ切替)
        src={`/relations-app/index.html${typeof window !== 'undefined' ? window.location.search : ''}`}
        title="Relations"
        className="h-full w-full border-0"
        // ロード後に iframe にフォーカスを移す → 内部の Ctrl+F ハンドラが効く
        onLoad={() => iframeRef.current?.contentWindow?.focus()}
      />
      <Link
        to="/"
        className="fixed top-2.5 left-3.5 z-[10000] rounded-sm border border-black/15 bg-white/90 px-2.5 py-1 text-[10px] font-medium tracking-[0.18em] uppercase text-[#1a1a1a] backdrop-blur-md transition-colors hover:bg-white"
      >
        ← rou39
      </Link>
    </div>
  );
}
