// 相関図ページの React UI。
// 役割は3つだけ:
//   1. 3D ビューワ (window.OZGraph3D.create) を初期化・破棄
//   2. 検索・モード切替・凡例絞り込みなどの操作 UI を提供
//   3. 選択中ノードの詳細パネルを出す
// 装飾・装置・タイムラインなど Claude Design 由来の試作要素は除去済み。

const { useState, useEffect, useRef, useMemo } = React;

const STYLES = `
.rel-root { position: fixed; inset: 0; overflow: hidden; background: #eae6dd; font-family: "Noto Sans JP", system-ui, sans-serif; color: #1a1a1a; }
.rel-canvas { position: absolute; inset: 0; }

.rel-header { position: absolute; top: 0; left: 0; right: 0; padding: 10px 16px 10px 116px; display: flex; gap: 14px; align-items: center; z-index: 10; background: rgba(255,253,248,0.85); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(20,18,14,0.08); }
.rel-title { font-size: 13px; font-weight: 600; letter-spacing: .03em; }
.rel-stats { font-size: 11px; color: #6a6258; font-family: "JetBrains Mono", monospace; }
.rel-spacer { flex: 1; }
.rel-htoggle { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; padding: 5px 10px; border: 1px solid rgba(20,18,14,0.18); background: transparent; cursor: pointer; border-radius: 2px; font-family: inherit; color: inherit; }
.rel-htoggle.on { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }

.rel-panel { position: absolute; top: 56px; bottom: 16px; background: rgba(255,253,248,0.92); backdrop-filter: blur(12px); border: 1px solid rgba(20,18,14,0.10); border-radius: 4px; padding: 14px; z-index: 10; font-size: 12px; overflow-y: auto; box-shadow: 0 4px 14px rgba(0,0,0,.04); transition: transform .2s ease, opacity .2s ease, visibility 0s linear 0s; display: flex; flex-direction: column; }
.rel-section.rel-controls-section { margin-top: auto; padding-top: 16px; border-top: 1px solid rgba(20,18,14,0.10); margin-bottom: 0; }
.rel-panel-left { left: 16px; width: 240px; }
.rel-panel-right { right: 16px; width: 280px; }
/* closed 時は アニメ完了後に visibility: hidden → Tab 順 / マウス入力 から除外 */
.rel-panel-left.closed { transform: translateX(calc(-100% - 32px)); opacity: 0; pointer-events: none; visibility: hidden; transition: transform .2s ease, opacity .2s ease, visibility 0s linear .2s; }
.rel-panel-right.closed { transform: translateX(calc(100% + 32px)); opacity: 0; pointer-events: none; visibility: hidden; transition: transform .2s ease, opacity .2s ease, visibility 0s linear .2s; }
.rel-panel-toggle {
  position: absolute; top: 64px; z-index: 11;
  width: 36px; height: 36px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; line-height: 1; font-weight: 600;
  background: #fffdf8; /* 不透明 — 背景のノード/ラベルが透けて視認性悪化を防ぐ */
  border: 1px solid rgba(20,18,14,0.18); border-radius: 4px;
  cursor: pointer; color: #1a1a1a;
  box-shadow: 0 4px 14px rgba(0,0,0,0.10);
  transition: background .15s ease, color .15s ease;
}
.rel-panel-toggle:hover { background: #fff; box-shadow: 0 4px 14px rgba(0,0,0,0.15); }
.rel-panel-toggle.on { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
.rel-panel-toggle.left { left: 16px; transition: left .2s ease, background .15s ease, color .15s ease; }
.rel-panel-toggle.right { right: 16px; transition: right .2s ease, background .15s ease, color .15s ease; }
.rel-panel-toggle.left.shifted { left: 272px; }   /* 左パネル left:16 + width:240 + 余白:16 */
.rel-panel-toggle.right.shifted { right: 312px; } /* 右パネル right:16 + width:280 + 余白:16 */

.rel-section { margin-bottom: 18px; }
.rel-section-title { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: #6a6258; margin-bottom: 8px; }

.rel-search { width: 100%; padding: 7px 10px; border: 1px solid rgba(20,18,14,0.16); border-radius: 2px; font-family: inherit; font-size: 12px; box-sizing: border-box; background: #fff; }
.rel-search:focus { outline: none; border-color: #b64727; }

.rel-range-row { display: flex; align-items: center; gap: 10px; }
.rel-range { flex: 1; }
.rel-range-val { font-family: "JetBrains Mono", monospace; font-size: 11px; min-width: 36px; text-align: right; }

.rel-mode-row { display: flex; gap: 4px; }
.rel-mode-btn { flex: 1; padding: 6px 0; font-size: 11px; border: 1px solid rgba(20,18,14,0.18); background: transparent; cursor: pointer; border-radius: 2px; font-family: inherit; color: #1a1a1a; }
.rel-mode-btn.on { background: #b64727; border-color: #b64727; color: #fff; }
.rel-mode-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.rel-legend-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; cursor: pointer; border-radius: 3px; font-size: 12px; transition: background .15s; }
.rel-legend-item:hover { background: rgba(20,18,14,0.04); }
.rel-legend-item.off { opacity: 0.3; }
.rel-legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.rel-legend-label { flex: 1; }
.rel-legend-num { font-family: "JetBrains Mono", monospace; font-size: 11px; color: #6a6258; }

.rel-search-results { max-height: 220px; overflow-y: auto; margin-top: 6px; }
.rel-search-result { display: flex; gap: 8px; padding: 6px; cursor: pointer; border-radius: 3px; align-items: center; }
.rel-search-result:hover { background: rgba(20,18,14,0.05); }
.rel-result-name { font-size: 12px; line-height: 1.2; }
.rel-result-handle { font-size: 10px; color: #6a6258; line-height: 1.2; font-family: "JetBrains Mono", monospace; }

.rel-avatar { border-radius: 50%; background: linear-gradient(135deg, #c44828, #2a4a7a); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 600; flex-shrink: 0; overflow: hidden; }
.rel-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }

.rel-selected { display: flex; flex-direction: column; gap: 12px; }
.rel-selected-head { display: flex; gap: 12px; align-items: center; }
.rel-selected-name { font-size: 14px; font-weight: 600; }
.rel-selected-handle { font-size: 11px; color: #6a6258; font-family: "JetBrains Mono", monospace; margin-top: 2px; }
.rel-selected-handle a { color: inherit; text-decoration: underline; }
.rel-selected-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rel-selected-stat { display: flex; flex-direction: column; }
.rel-selected-stat-label { color: #6a6258; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
.rel-selected-stat-val { font-family: "JetBrains Mono", monospace; font-size: 13px; }
.rel-selected-actions { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
.rel-action-btn { padding: 8px; font-size: 11px; border: 1px solid #b64727; color: #b64727; background: transparent; cursor: pointer; border-radius: 2px; font-family: inherit; transition: all .12s; }
.rel-action-btn:hover { background: #b64727; color: #fff; }
.rel-empty { font-size: 12px; color: #6a6258; line-height: 1.7; }
.rel-hint { font-size: 11px; color: #6a6258; margin-top: 8px; line-height: 1.5; }

.rel-filter-summary { padding: 10px 12px; background: rgba(182,71,39,0.06); border-radius: 4px; }
.rel-count-num { font-family: "JetBrains Mono", monospace; font-size: 22px; font-weight: 600; color: #b64727; }
.rel-count-tot { font-size: 11px; color: #6a6258; margin-left: 4px; }
.rel-toggle-label { display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer; user-select: none; }
.rel-toggle-label input { cursor: pointer; }

.rel-self-section { padding: 12px; background: rgba(20,18,14,0.04); border-radius: 4px; position: relative; }
.rel-self-section .rel-section-title { color: #1a1a1a; }
.rel-self-recenter { position: absolute; top: 8px; right: 8px; padding: 4px 8px; font-size: 10px; letter-spacing: .08em; border: 1px solid rgba(20,18,14,0.18); background: #fffdf8; cursor: pointer; border-radius: 2px; font-family: inherit; color: #1a1a1a; }
.rel-self-recenter:hover { background: #b64727; color: #fff; border-color: #b64727; }
.rel-self-stats { font-size: 11px; color: #6a6258; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(20,18,14,0.08); }
.rel-self-stats b { color: #1a1a1a; font-family: "JetBrains Mono", monospace; font-weight: 500; }

.rel-help {
  display: inline-flex; align-items: center; justify-content: center;
  width: 13px; height: 13px; border-radius: 50%;
  background: rgba(20,18,14,0.1); color: #6a6258;
  font-size: 9px; font-weight: 600; line-height: 1;
  cursor: help; margin-left: 4px; vertical-align: middle;
  font-family: system-ui, sans-serif;
}
.rel-help:hover { background: rgba(20,18,14,0.25); color: #1a1a1a; }

.rel-stat-clickable { cursor: pointer; transition: color .15s ease; border-bottom: 1px dashed transparent; }
.rel-stat-clickable:hover { color: #b64727; border-bottom-color: rgba(182,71,39,0.4); }
.rel-stat-clickable.active { color: #b64727; border-bottom-color: #b64727; font-weight: 600; }
`;

function formatNum(n) {
  if (!n) return '0';
  if (n >= 10000000) return (n / 1000000).toFixed(0) + 'M';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 10000) return (n / 1000).toFixed(0) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toLocaleString();
}

function Avatar({ node, size = 48 }) {
  const initials = (node.name || node.handle || '?').slice(0, 2).toUpperCase();
  const fontSize = Math.round(size * 0.36);
  if (node.avatarUrl) {
    return (
      <div className="rel-avatar" style={{ width: size, height: size }}>
        <img src={node.avatarUrl} alt={initials} loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />
      </div>
    );
  }
  return <div className="rel-avatar" style={{ width: size, height: size, fontSize }}>{initials}</div>;
}

function OZViz({ graph }) {
  const containerRef = useRef(null);
  const threeRef = useRef(null);
  const searchInputRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [autoRotate, setAutoRotate] = useState(true); // デフォルトで回転、 操作中だけ停止
  const [panned, setPanned] = useState(false); // 右クリックパンで target がずれたか
  // 「選択ノードの 被フォロー/フォロー/相互 のみに絞る」 フィルタ
  // null = 解除、 { type: 'in'|'out'|'mutual', sourceId: string } = 該当のみ表示
  const [nodeFilter, setNodeFilter] = useState(null);
  // 左右パネル開閉(初期 false = 隠れた状態でグラフをフルスクリーンで見る)
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);
  // メタデータフィルタ
  const [minFollowers, setMinFollowers] = useState(0);
  const [minFollows, setMinFollows] = useState(0);
  const [minStatuses, setMinStatuses] = useState(0);
  // アカウント作成時期フィルタ
  const [ageDir, setAgeDir] = useState('all'); // 'all' | 'oldest' | 'newest'
  const [ageCount, setAgeCount] = useState(200);
  const [visibleCount, setVisibleCount] = useState(0);
  const [metaRanges, setMetaRanges] = useState({ maxFollowers: 1000000, maxFollows: 100000, maxStatuses: 500000, oldestCount: 1, verifiedCount: 0 });
  // 操作感度
  const [rotateSpeed, setRotateSpeed] = useState(0.3);
  const [panSpeed, setPanSpeed] = useState(0.5);
  const [zoomSpeed, setZoomSpeed] = useState(0.45);

  const stats = useMemo(() => ({
    total: graph.stats.totalNodes,
    edges: graph.stats.totalEdges,
    mutual: graph.stats.mutualsCount || 0,
    follow: graph.followsOfMe?.length || 0,
    follower: graph.followersOfMe?.length || 0,
    other: graph.nodes.filter(n => n.depth >= 2).length,
  }), [graph]);

  const selfNode = useMemo(() => graph.nodes.find(n => n.isSelf), [graph]);

  useEffect(() => {
    if (!containerRef.current) return;
    const viz = window.OZGraph3D.create(containerRef.current, graph, {
      theme: 'oz', layout: 'sphere', edgeStyle: 'straight',
      particles: 0, nodeScale: 1, labelsOn: false,
      sizeMetric: 'followers', importanceMetric: 'followers',
    });
    threeRef.current = viz;
    // シングルクリック = 詳細表示のみ(視点固定で複数ノードを比較しやすく)
    // ダブルクリック = 詳細 + カメラを寄せる(focus)
    // reroot(=このノードを中心にレイアウトし直す)は右パネルのボタン経由
    viz.onNodeClick((n) => { if (n) { setSelected(n); setShowRight(true); } });
    viz.onNodeDblClick((n) => { if (n) { setSelected(n); setShowRight(true); viz.focus(n.id); } });
    // メタデータの最大値を取得して UI スライダー範囲設定
    if (viz.getMetaRanges) {
      const r = viz.getMetaRanges();
      setMetaRanges(r);
      setVisibleCount(viz.getVisibleCount?.() ?? 0);
    }
    // reroot で中心ノードが変わったらノードフィルタを解除(別中心では意味が違うため)
    viz.onCenterChange?.(() => {
      setNodeFilter(null);
      viz.setNodeFilter?.(null);
    });
    return () => { viz.dispose(); };
    // eslint-disable-next-line
  }, []);


  // キーボードショートカット: Ctrl+F=検索、 [ で左パネル、 ] で右パネル、 Esc で両閉じ
  useEffect(() => {
    const onKey = (e) => {
      // Ctrl+F (or Cmd+F): ブラウザ検索を抑制して左パネルの検索 input にフォーカス
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setShowLeft(true);
        // パネルのスライドアニメ完了後にフォーカス
        setTimeout(() => searchInputRef.current?.focus(), 220);
        return;
      }
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === '[') setShowLeft(v => !v);
      else if (e.key === ']') setShowRight(v => !v);
      else if (e.key === 'Escape') { setShowLeft(false); setShowRight(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { threeRef.current?.setAutoRotate(autoRotate); }, [autoRotate]);

  // ユーザーが操作したら autoRotate を一時的にオフ、 4秒触らないでいれば自動オン。
  // パンしたら「中心に戻す」 ボタンを表示。
  useEffect(() => {
    const viz = threeRef.current;
    if (!viz?.onInteract) return;
    let timer = null;
    viz.onInteract(() => {
      setAutoRotate(false);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setAutoRotate(true), 4000);
    });
    viz.onPan?.(() => setPanned(true));
    return () => { if (timer) clearTimeout(timer); };
  }, []);
  useEffect(() => {
    const c = threeRef.current?.controls; if (!c) return;
    c.rotateSpeed = rotateSpeed;
    c.panSpeed = panSpeed;
    c.zoomSpeed = zoomSpeed;
  }, [rotateSpeed, panSpeed, zoomSpeed]);
  // フィルタ全体をまとめて 1 useEffect で送信(setFilter から visibleCount 取得)
  useEffect(() => {
    const viz = threeRef.current; if (!viz) return;
    let minRank = 0, maxRank = Infinity;
    if (ageDir === 'oldest') { minRank = 1; maxRank = ageCount; }
    else if (ageDir === 'newest') {
      minRank = Math.max(1, metaRanges.oldestCount - ageCount + 1);
      maxRank = metaRanges.oldestCount;
    }
    const count = viz.setFilter({
      minFollowers, minFollows, minStatuses,
      minRank, maxRank,
    });
    if (typeof count === 'number') setVisibleCount(count);
  }, [minFollowers, minFollows, minStatuses, ageDir, ageCount, metaRanges.oldestCount]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return graph.nodes
      .filter(n => !n.isSelf && (
        (n.handle || '').toLowerCase().includes(q) ||
        (n.name || '').toLowerCase().includes(q)
      ))
      .slice(0, 20);
  }, [query, graph]);

  // 選択ノードの「グラフ内 被フォロー/フォロー/相互」 数値クリック時:
  // 該当ノードだけにグラフを絞る (もう一度押すと解除、 別の数字を押すと切り替え)
  function handleClickRelation(type) {
    if (!selected) return;
    const viz = threeRef.current; if (!viz?.setNodeFilter) return;
    if (nodeFilter?.type === type && nodeFilter?.sourceId === selected.id) {
      setNodeFilter(null);
      viz.setNodeFilter(null);
      return;
    }
    const set = viz.getNodeRelationSet?.(selected.id, type);
    if (set) {
      setNodeFilter({ type, sourceId: selected.id });
      viz.setNodeFilter(set);
    }
  }
  const isActiveFilter = (type) =>
    nodeFilter?.type === type && nodeFilter?.sourceId === selected?.id;

  // 選択ノードの「このグラフ内」での繋がり集計
  // - inGraph.in    = このノードを誰かがフォローしている本数(in-edges)
  // - inGraph.out   = このノードが誰かをフォローしている本数(out-edges)
  // - inGraph.mutual = 相互フォローの本数
  const inGraph = useMemo(() => {
    if (!selected) return null;
    // mutual edge は loader.js で1エントリ化され from/to の方向は a<b でソートされる。
    // → 相互ノードは in にも out にも含めるべき(双方向で繋がっているため)。
    let inE = 0, outE = 0, mutualE = 0;
    for (const e of graph.edges) {
      if (e.from === selected.id) {
        outE++;
        if (e.mutual) { inE++; mutualE++; }
      } else if (e.to === selected.id) {
        inE++;
        if (e.mutual) { outE++; mutualE++; }
      }
    }
    return { in: inE, out: outE, mutual: mutualE };
  }, [selected, graph]);

  return (
    <>
      <style>{STYLES}</style>
      <div className="rel-root">
        <div className="rel-canvas" ref={containerRef}></div>

        <header className="rel-header">
          <span className="rel-title">相関図 — {selfNode?.handle || 'me'} の周辺</span>
          <span className="rel-stats">
            フォロー先 約{(Math.round(stats.follow / 100) / 10).toFixed(1)}千
            {' + '}
            共通フォロー先 約{(Math.round((stats.total - 1 - stats.follow) / 100) / 10).toFixed(1)}千
            <span style={{ color: '#9a8e80' }}> (元371万件 / 100人以上重複) </span>
            {' → '}
            計 約{(Math.round(stats.total / 100) / 10).toFixed(1)}千人 / 約{Math.round(stats.edges / 10000)}万本
          </span>
          <span className="rel-spacer"></span>
          {panned && (
            <button className="rel-htoggle"
              onClick={() => { threeRef.current?.resetView?.(); setPanned(false); }}
              title="視点を中心 (自分) に戻す">視点リセット</button>
          )}
          <button className={`rel-htoggle ${autoRotate ? 'on' : ''}`} onClick={() => setAutoRotate(v => !v)}>自動回転</button>
        </header>

        {/* パネル開閉ボタン(ヘッダー直下、 ヘッダーから独立)。 開いてる時はパネルの隣にスライド */}
        <button className={`rel-panel-toggle left ${showLeft ? 'on shifted' : ''}`}
          onClick={() => setShowLeft(v => !v)} title="操作パネル ([ キー)">☰</button>
        <button className={`rel-panel-toggle right ${showRight ? 'on shifted' : ''}`}
          onClick={() => setShowRight(v => !v)} title="情報パネル (] キー)">ℹ</button>

        <aside className={`rel-panel rel-panel-left ${showLeft ? '' : 'closed'}`}>
          <div className="rel-section">
            <div className="rel-section-title">検索</div>
            <input ref={searchInputRef} className="rel-search" placeholder="名前 / @ハンドル (Ctrl+F)"
              value={query} onChange={e => setQuery(e.target.value)} />
            {searchResults.length > 0 && (
              <div className="rel-search-results">
                {searchResults.map(n => (
                  <div key={n.id} className="rel-search-result"
                    onClick={() => { setSelected(n); threeRef.current?.focus(n.id); setQuery(''); }}>
                    <Avatar node={n} size={28} />
                    <div>
                      <div className="rel-result-name">{n.name}</div>
                      <div className="rel-result-handle">@{n.handle}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rel-section rel-filter-summary">
            <div className="rel-section-title">表示中</div>
            <div className="rel-count">
              <span className="rel-count-num">{visibleCount.toLocaleString()}</span>
              <span className="rel-count-tot"> / {(stats.total - 1).toLocaleString()}人</span>
            </div>
          </div>

          <div className="rel-section">
            <div className="rel-section-title">フォロワー数 ≥</div>
            <div className="rel-range-row">
              <input className="rel-range" type="range" min="0" max="100"
                value={Math.round(Math.log10(Math.max(1, minFollowers)) / Math.log10(Math.max(2, metaRanges.maxFollowers)) * 100)}
                onChange={e => setMinFollowers(Math.round(Math.pow(metaRanges.maxFollowers, +e.target.value / 100)) - 1)} />
              <span className="rel-range-val">{formatNum(minFollowers)}</span>
            </div>
          </div>

          <div className="rel-section">
            <div className="rel-section-title">フォロー数 ≥</div>
            <div className="rel-range-row">
              <input className="rel-range" type="range" min="0" max="100"
                value={Math.round(Math.log10(Math.max(1, minFollows)) / Math.log10(Math.max(2, metaRanges.maxFollows)) * 100)}
                onChange={e => setMinFollows(Math.round(Math.pow(metaRanges.maxFollows, +e.target.value / 100)) - 1)} />
              <span className="rel-range-val">{formatNum(minFollows)}</span>
            </div>
          </div>

          <div className="rel-section">
            <div className="rel-section-title">ツイート数 ≥</div>
            <div className="rel-range-row">
              <input className="rel-range" type="range" min="0" max="100"
                value={Math.round(Math.log10(Math.max(1, minStatuses)) / Math.log10(Math.max(2, metaRanges.maxStatuses)) * 100)}
                onChange={e => setMinStatuses(Math.round(Math.pow(metaRanges.maxStatuses, +e.target.value / 100)) - 1)} />
              <span className="rel-range-val">{formatNum(minStatuses)}</span>
            </div>
          </div>

          <div className="rel-section">
            <div className="rel-section-title">アカウント作成時期</div>
            <div className="rel-mode-row">
              <button className={`rel-mode-btn ${ageDir === 'all' ? 'on' : ''}`}
                onClick={() => setAgeDir('all')}>指定なし</button>
              <button className={`rel-mode-btn ${ageDir === 'oldest' ? 'on' : ''}`}
                onClick={() => setAgeDir('oldest')} title="古いアカウントから N 名">古い順</button>
              <button className={`rel-mode-btn ${ageDir === 'newest' ? 'on' : ''}`}
                onClick={() => setAgeDir('newest')} title="新しいアカウントから N 名">新しい順</button>
            </div>
            {ageDir !== 'all' && (
              <div className="rel-range-row" style={{ marginTop: 8 }}>
                <input className="rel-range" type="range" min="50" max={metaRanges.oldestCount} step="50"
                  value={ageCount} onChange={e => setAgeCount(+e.target.value)} />
                <span className="rel-range-val">{ageCount}名</span>
              </div>
            )}
          </div>

          {/* リセットボタン */}
          {(minFollowers > 0 || minFollows > 0 || minStatuses > 0 || ageDir !== 'all' || nodeFilter) && (
            <div className="rel-section">
              <button className="rel-action-btn"
                onClick={() => {
                  setMinFollowers(0); setMinFollows(0); setMinStatuses(0);
                  setAgeDir('all');
                  setNodeFilter(null);
                  threeRef.current?.setNodeFilter?.(null);
                }}>絞り込みをリセット</button>
            </div>
          )}

        </aside>

        <aside className={`rel-panel rel-panel-right ${showRight ? '' : 'closed'}`}>
          {/* グラフの中心ユーザー(常時表示)。 これが誰の周辺の図か明示。 */}
          {selfNode && (
            <div className="rel-section rel-self-section">
              <div className="rel-section-title">データの基点</div>
              <div className="rel-selected-head">
                <Avatar node={selfNode} size={48} />
                <div>
                  <div className="rel-selected-name">{selfNode.name}</div>
                  <div className="rel-selected-handle">
                    <a href={`https://twitter.com/${selfNode.handle}`} target="_blank" rel="noopener">@{selfNode.handle}</a>
                  </div>
                </div>
              </div>
              <button className="rel-self-recenter"
                onClick={() => threeRef.current?.reroot(selfNode.id)}
                title="このユーザー中心のレイアウトに戻す">
                中心に戻す
              </button>
              <div className="rel-self-stats">
                X.com フォロワー <b>{(selfNode.followers || 0).toLocaleString()}</b>
                <span style={{ margin: '0 6px', color: '#c4b9a8' }}>·</span>
                フォロー <b>{(selfNode.follows || 0).toLocaleString()}</b>
              </div>
            </div>
          )}

          <div className="rel-section">
            <div className="rel-section-title">選択中</div>
            {selected ? (
              <div className="rel-selected">
                <div className="rel-selected-head">
                  <Avatar node={selected} size={56} />
                  <div>
                    <div className="rel-selected-name">{selected.name}</div>
                    <div className="rel-selected-handle">
                      <a href={`https://twitter.com/${selected.handle}`} target="_blank" rel="noopener">@{selected.handle}</a>
                    </div>
                  </div>
                </div>
                <div className="rel-selected-stats">
                  <div className="rel-selected-stat">
                    <span className="rel-selected-stat-label">
                      グラフ内 被フォロー
                      <span className="rel-help" title="このページに含まれているノード間で、 このユーザーをフォローしている人数(=in-edges)">?</span>
                    </span>
                    <span className={`rel-selected-stat-val rel-stat-clickable ${isActiveFilter('in') ? 'active' : ''}`}
                      onClick={() => handleClickRelation('in')}
                      title="クリックで このユーザーをフォローしているノードだけに絞り込み">
                      {inGraph?.in.toLocaleString() ?? 0}
                    </span>
                  </div>
                  <div className="rel-selected-stat">
                    <span className="rel-selected-stat-label">
                      グラフ内 フォロー
                      <span className="rel-help" title="このページに含まれているノード間で、 このユーザーがフォローしている人数(=out-edges)">?</span>
                    </span>
                    <span className={`rel-selected-stat-val rel-stat-clickable ${isActiveFilter('out') ? 'active' : ''}`}
                      onClick={() => handleClickRelation('out')}
                      title="クリックで このユーザーがフォローしているノードだけに絞り込み">
                      {inGraph?.out.toLocaleString() ?? 0}
                    </span>
                  </div>
                  <div className="rel-selected-stat">
                    <span className="rel-selected-stat-label">
                      グラフ内 相互
                      <span className="rel-help" title="このユーザーと 相互フォローのノードだけ">?</span>
                    </span>
                    <span className={`rel-selected-stat-val rel-stat-clickable ${isActiveFilter('mutual') ? 'active' : ''}`}
                      onClick={() => handleClickRelation('mutual')}
                      title="クリックで このユーザーと相互フォローのノードだけに絞り込み">
                      {inGraph?.mutual.toLocaleString() ?? 0}
                    </span>
                  </div>
                  <div className="rel-selected-stat">
                    <span className="rel-selected-stat-label">
                      X.com フォロワー
                      <span className="rel-help" title="X.com の取得時点の公開フォロワー数。 鍵アカウント・凍結等で 0 のことあり">?</span>
                    </span>
                    <span className="rel-selected-stat-val" style={{ color: '#6a6258' }}>
                      {(selected.followers || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="rel-selected-actions">
                  <button className="rel-action-btn"
                    onClick={() => threeRef.current?.reroot(selected.id)}>このユーザーを中心に</button>
                </div>
              </div>
            ) : (
              <div className="rel-empty">
                ノードをクリックして詳細表示<br />
                <span style={{ fontSize: 11 }}>ダブルクリック = 視点を寄せる</span>
              </div>
            )}
          </div>

          <div className="rel-section rel-controls-section">
            <div className="rel-section-title">操作感度</div>
            <div className="rel-range-row">
              <span style={{ fontSize: 10, color: '#6a6258', minWidth: 40 }}>回転</span>
              <input className="rel-range" type="range" min="0.1" max="2" step="0.1"
                value={rotateSpeed} onChange={e => setRotateSpeed(+e.target.value)} />
              <span className="rel-range-val">{rotateSpeed.toFixed(1)}</span>
            </div>
            <div className="rel-range-row">
              <span style={{ fontSize: 10, color: '#6a6258', minWidth: 40 }}>パン</span>
              <input className="rel-range" type="range" min="0.1" max="3" step="0.1"
                value={panSpeed} onChange={e => setPanSpeed(+e.target.value)} />
              <span className="rel-range-val">{panSpeed.toFixed(1)}</span>
            </div>
            <div className="rel-range-row">
              <span style={{ fontSize: 10, color: '#6a6258', minWidth: 40 }}>ズーム</span>
              <input className="rel-range" type="range" min="0.2" max="3" step="0.1"
                value={zoomSpeed} onChange={e => setZoomSpeed(+e.target.value)} />
              <span className="rel-range-val">{zoomSpeed.toFixed(1)}</span>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
