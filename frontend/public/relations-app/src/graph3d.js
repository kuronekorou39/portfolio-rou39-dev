// 3D Graph Engine — Three.js based
// LOD, instanced node rendering, multiple edge styles, multiple layouts
//
// window.OZGraph3D.create(container, graph, opts) → {
//   camera, scene, renderer, controls,
//   setLayout(name), setEdgeStyle(name), setTheme(theme),
//   focus(nodeId), reroot(nodeId),
//   onNodeHover(cb), onNodeClick(cb), onNodeDblClick(cb),
//   setFilter({mutuals, oneway, minFollowers, maxFollowers}),
//   setAutoRotate(b), setLabels(b), setNodeScale(s),
//   dispose()
// }

(function () {
  const V3 = THREE.Vector3;

  // ─── Style helpers ──────────────────────────────────────────────────
  function toCss(hex) {
    const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function shade(hex, amt) {
    // amt in [-1,1]; negative = darker, positive = lighter
    let r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
    if (amt >= 0) {
      r = Math.round(r + (255 - r) * amt);
      g = Math.round(g + (255 - g) * amt);
      b = Math.round(b + (255 - b) * amt);
    } else {
      const a = 1 + amt;
      r = Math.round(r * a); g = Math.round(g * a); b = Math.round(b * a);
    }
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  // Faint family-crest (kamon) pattern as tileable SVG
  function kamonSVG(T) {
    const ink = shade(T.grid, -0.15);
    return '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360" viewBox="0 0 360 360">' +
      '<defs><pattern id="p" width="120" height="120" patternUnits="userSpaceOnUse">' +
      // Double concentric circles
      '<circle cx="60" cy="60" r="44" fill="none" stroke="' + ink + '" stroke-width="0.6" opacity="0.55"/>' +
      '<circle cx="60" cy="60" r="30" fill="none" stroke="' + ink + '" stroke-width="0.5" opacity="0.45"/>' +
      // 8-point star / asanoha-ish radiating lines
      '<g opacity="0.35" stroke="' + ink + '" stroke-width="0.5" fill="none">' +
        '<line x1="60" y1="20" x2="60" y2="100"/>' +
        '<line x1="20" y1="60" x2="100" y2="60"/>' +
        '<line x1="32" y1="32" x2="88" y2="88"/>' +
        '<line x1="88" y1="32" x2="32" y2="88"/>' +
      '</g>' +
      // tiny center dot
      '<circle cx="60" cy="60" r="2" fill="' + ink + '" opacity="0.6"/>' +
      '</pattern></defs>' +
      '<rect width="100%" height="100%" fill="url(#p)"/>' +
      '</svg>';
  }
  // Sharp glow ring texture for halos
  function makeHaloTexture(rgb) {
    const size = 128;
    const c = document.createElement('canvas'); c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.32, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(' + rgb + ',0)');
    g.addColorStop(0.55, 'rgba(' + rgb + ',0.8)');
    g.addColorStop(0.78, 'rgba(' + rgb + ',0.25)');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }
  function hexToRgbStr(hex) {
    return ((hex >> 16) & 0xff) + ',' + ((hex >> 8) & 0xff) + ',' + (hex & 0xff);
  }

  // ─── Layouts ─────────────────────────────────────────────────────────
  // Each layout returns a Map<nodeId, {x,y,z}>
  function layoutSphere(graph) {
    // 関係性の濃さで距離が変わる "shells" レイアウト。
    // - 内側 (R≈25): 相互フォロー = 親しい人
    // - 中間 (R≈55): 一方向のフォロー / フォロワー
    // - 外側 (R≈90): 深さ2 = フォロー先のフォロー先(自分と直接繋がりなし)
    // y 軸は フォロワー数の対数 で割り当てる → 球の表面ではなく内部にも分散、
    // 立体的なボリュームが出て "球体感" が消える。
    const pos = new Map();
    const selfId = (graph.nodes.find(n => n.isSelf) || { id: 'me' }).id;
    pos.set(selfId, { x: 0, y: 0, z: 0 });

    const mutuals = graph.mutuals || new Set();
    const inner = [], middle = [], outer = [];
    for (const n of graph.nodes) {
      if (n.isSelf) continue;
      if (n.depth >= 2) outer.push(n);
      else if (mutuals.has(n.id)) inner.push(n);
      else middle.push(n);
    }

    function hashStr(s) {
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      return Math.abs(h);
    }

    // 各シェルにノードを配置(半径と y はノードごとに揺らぎを持たせる)
    function placeShell(arr, rNominal) {
      if (arr.length === 0) return;
      const fol = arr.map(n => Math.log10(1 + (n.followers || 0)));
      const fmin = Math.min(...fol);
      const fmax = Math.max(...fol);
      const range = Math.max(fmax - fmin, 0.001);
      const phi = Math.PI * (Math.sqrt(5) - 1); // 黄金角
      arr.forEach((n, i) => {
        const norm = (Math.log10(1 + (n.followers || 0)) - fmin) / range; // 0..1
        const y = (norm - 0.5) * rNominal * 1.4; // 縦伸び
        const h = hashStr(n.id);
        // 角度: 黄金角ベース + ハッシュで揺らぎ
        const th = phi * i + ((h % 1000) / 159);
        // 半径もハッシュで 0.75〜1.15 倍
        const r = rNominal * (0.75 + 0.4 * ((h % 1000) / 1000));
        // 球の "内部" に入るように、水平半径を r^2 - y^2 から取る
        const h2 = Math.max(r * r - y * y, r * r * 0.15);
        const horizR = Math.sqrt(h2);
        pos.set(n.id, {
          x: Math.cos(th) * horizR,
          y,
          z: Math.sin(th) * horizR,
        });
      });
    }

    placeShell(inner, 45);   // 相互フォロー: 25 → 45 で密集解消
    placeShell(middle, 95);  // 一方向: 55 → 95
    placeShell(outer, 140);  // 深さ2: 90 → 140 でもっと遠くに散らばる
    return pos;
  }

  const LAYOUTS = { sphere: layoutSphere };

  // ─── Theme palettes ──────────────────────────────────────────────────
  const THEMES = {
    oz: {
      bg: 0xffffff,
      fog: 0xf6f2ea,
      fogNear: 80, fogFar: 280,
      self: 0x0a0a0c,
      mutual: 0xc44828,   // 朱
      follow: 0x2a4a7a,   // 藍
      follower: 0xc49a28, // 金
      d1: 0x403a33,
      d2: 0xa8a098,
      edgeOpacity: 0.28,
      labelColor: '#1a1a1a',
      grid: 0xc9bfa8,
      particleColor: 0xd4b088,
      bgPattern: 'sakura',
    },
    kasumi: {
      bg: 0xecebe8,
      fog: 0xecebe8,
      fogNear: 40, fogFar: 170,
      self: 0x181818,
      mutual: 0x7a5a8a,
      follow: 0x4a6a8a,
      follower: 0x9a8a6a,
      d1: 0x3a3a3a,
      d2: 0x9a9a9a,
      edgeOpacity: 0.25,
      labelColor: '#222',
      grid: 0xdad6ce,
      particleColor: 0xa8a0c0,
    },
    mon: {
      bg: 0x0e0c0a,
      fog: 0x0e0c0a,
      fogNear: 50, fogFar: 220,
      self: 0xf0e6d2,
      mutual: 0xe04a22,
      follow: 0xd4a23b,
      follower: 0xf2d68a,
      d1: 0xd4c9b3,
      d2: 0x6a5f4f,
      edgeOpacity: 0.55,
      labelColor: '#f0e6d2',
      grid: 0x3a2f25,
      particleColor: 0xe04a22,
    },
  };

  // ─── Main ────────────────────────────────────────────────────────────
  function create(container, graph, opts = {}) {
    const theme = opts.theme || 'oz';
    let T = THEMES[theme];
    const W = () => container.clientWidth;
    const H = () => container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(T.fog, T.fogNear, T.fogFar);

    // Camera
    const camera = new THREE.PerspectiveCamera(55, W() / H(), 0.1, 700);
    camera.position.set(0, 35, 160);

    // Renderer (alpha so CSS backdrop shows through subtly)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W(), H());
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // ─── Atmospheric backdrop (gradient sky + kamon watermark) ─────────
    // Layered behind the canvas using CSS — gives us a richer OZ-like
    // off-white hue gradient with a faint family-crest pattern.
    // Keep whatever position the container already has (CSS in oz-viz.jsx
    // sets .oz-3d to absolute+inset:0 which properly fills its parent).
    const backdrop = document.createElement('div');
    backdrop.style.cssText = [
      'position:absolute', 'inset:0', 'z-index:0', 'pointer-events:none',
      // Pure white core + almost imperceptible warm edge (very OZ)
      'background:' +
        'radial-gradient(130% 95% at 50% 30%, #ffffff 0%, #ffffff 55%, #fdf8ef 82%, #f6ebd6 100%)',
    ].join(';');
    // Faint reddish outer rim vignette (OZ's red-tinted frame glow)
    const rimGlow = document.createElement('div');
    rimGlow.style.cssText = [
      'position:absolute', 'inset:0', 'pointer-events:none', 'z-index:1',
      'background:' +
        'radial-gradient(120% 85% at 50% 50%, rgba(255,255,255,0) 70%, rgba(196,72,40,0.02) 92%, rgba(196,72,40,0.05) 100%)',
    ].join(';');
    // 家紋透かしは控えめに(従来 opacity:0.22 → 0.06、画面の朱色のもや軽減)
    const watermark = document.createElement('div');
    watermark.style.cssText = [
      'position:absolute', 'inset:0', 'pointer-events:none', 'z-index:1',
      'opacity:0.06', 'mix-blend-mode:multiply',
      "background-image:url('data:image/svg+xml;utf8," + encodeURIComponent(kamonSVG(T)) + "')",
      'background-size:460px 460px', 'background-position:center',
    ].join(';');
    container.appendChild(backdrop);
    container.appendChild(watermark);
    container.appendChild(rimGlow);
    // Canvas in normal flow — fills its absolute parent .oz-3d container.
    // (Backdrop + watermark + rim are absolutely positioned inside the same container.)
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.position = 'relative';
    renderer.domElement.style.zIndex = '2';

    // Controls
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.8;
    controls.minDistance = 5;
    controls.maxDistance = 260;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.3;

    // 「光の円盤」(地面プレーン) は装飾ノイズになるため削除。
    // 元 stagePlane (PlaneGeometry 280x280 with radial gradient + concentric rings + spokes)。

    // A soft "contact shadow" under the central orb (gives weight)
    const shadowTex = (() => {
      const size = 256;
      const c = document.createElement('canvas'); c.width = c.height = size;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(40,24,14,0.45)');
      g.addColorStop(0.5, 'rgba(40,24,14,0.12)');
      g.addColorStop(1, 'rgba(40,24,14,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
      return new THREE.CanvasTexture(c);
    })();
    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 18),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = -29.8;
    scene.add(contactShadow);

    // Keep gridGroup variable for compatibility but empty (stage replaces it)
    const gridGroup = new THREE.Group();
    scene.add(gridGroup);

    // Lights — richer OZ palette
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    // Warm key (top-front)
    const key = new THREE.DirectionalLight(0xfff2dc, 0.85);
    key.position.set(30, 80, 40);
    scene.add(key);
    // Cool rim (back-left, slightly blueish)
    const rim = new THREE.DirectionalLight(0xcfd9ea, 0.55);
    rim.position.set(-40, 40, -50);
    scene.add(rim);
    // Accent fill from below (朱 tint, soft)
    const fill = new THREE.PointLight(T.mutual, 0.35, 160);
    fill.position.set(0, -10, 0);
    scene.add(fill);

    // ─── Nodes: instanced mesh for speed, + separate "halo" sprites ────
    const nodeSphereGeom = new THREE.SphereGeometry(1, 18, 14);
    // transparent=true だと InstancedMesh 全体が「中心(0,0,0)で1個の透過物」として
    // back-to-front ソートされる → カメラが中心に近いと球が最後に描画されて Sprite を
    // 覆ってしまう。opaque にすれば depth buffer にピクセル単位で書かれて正しく前後判定。
    const nodeMat = new THREE.MeshPhysicalMaterial({
      metalness: 0.25, roughness: 0.28,
      clearcoat: 0.55, clearcoatRoughness: 0.35,
    });
    const instMesh = new THREE.InstancedMesh(nodeSphereGeom, nodeMat, graph.nodes.length);
    instMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (instMesh.instanceColor === null) {
      instMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(graph.nodes.length * 3), 3);
    }
    scene.add(instMesh);

    // Self as its own mesh (highlighted) — layered icosahedron + inner glowing core
    const selfGroup = new THREE.Group();
    const selfGeom = new THREE.IcosahedronGeometry(2.4, 2);
    const selfMat = new THREE.MeshPhysicalMaterial({
      color: T.self, metalness: 0.7, roughness: 0.15,
      clearcoat: 1.0, clearcoatRoughness: 0.1,
      emissive: T.mutual, emissiveIntensity: 0.22,
    });
    const selfMesh = new THREE.Mesh(selfGeom, selfMat);
    selfGroup.add(selfMesh);
    // Inner wire orb — floats and turns for life
    const wireGeom = new THREE.IcosahedronGeometry(3.4, 1);
    const wireMat = new THREE.MeshBasicMaterial({ color: T.mutual, wireframe: true, transparent: true, opacity: 0.35 });
    const wireOrb = new THREE.Mesh(wireGeom, wireMat);
    selfGroup.add(wireOrb);
    // Soft glow sprite behind self
    const glowRgb = hexToRgbStr(T.mutual);
    const selfGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeHaloTexture(glowRgb), transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    selfGlow.scale.set(16, 16, 1);
    selfGroup.add(selfGlow);
    scene.add(selfGroup);

    // ─── Avatar Sprite Group ─────────────────────────────────────────
    // 各ノードの上に X.com アバター画像を Sprite として重ねる。
    // 上位 N 人(フォロワー数順)を 30ms 間隔で順次ロード(初回はゼロ、
    // 放っておくと全員に顔が乗る)。CORS 失敗ノードは球のまま。
    const avatarGroup = new THREE.Group();
    scene.add(avatarGroup);
    const avatarSprites = new Map(); // node.id -> { sprite, mat, tex }
    let avatarLoaderHandle = null;
    let avatarLoaderActive = false;

    // 中心 (self) を強調する小さな1リングのみ。元は3重リング(装飾過多)。
    // ノードを縮小したのに合わせて半径も小さく。
    const haloGeom = new THREE.RingGeometry(2.0, 2.18, 64);
    const haloMat = new THREE.MeshBasicMaterial({ color: T.mutual, side: THREE.DoubleSide, transparent: true, opacity: 0.55 });
    const halo = new THREE.Mesh(haloGeom, haloMat);
    halo.rotation.x = -Math.PI / 2;
    scene.add(halo);

    // 選択ノード用グロウ(常時表示・脈動・強め)
    const selRgb = hexToRgbStr(T.mutual);
    const selGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeHaloTexture(selRgb), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    selGlow.scale.set(10, 10, 1);
    scene.add(selGlow);

    // ホバーノード用グロウ(マウス追従・控えめ)。 select と同じノードでなければ別途表示。
    const hoverGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeHaloTexture(selRgb), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    hoverGlow.scale.set(10, 10, 1);
    scene.add(hoverGlow);

    // 「中心ノード」 マーカー (reroot で他人を中心にした時の selGlow 同等の光)
    const centerGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeHaloTexture(selRgb), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    centerGlow.scale.set(10, 10, 1);
    scene.add(centerGlow);

    // Position + data arrays
    const nodePositions = new Map(); // id -> {x,y,z}

    // ノードIDから「接続している edges」を引くインデックス。
    // 'select' モードの rebuildEdges を O(全 edges) → O(該当ノードの接続数) に
    // 高速化するため。 起動時に1回だけ構築。
    const edgesByNode = new Map();
    for (const e of graph.edges) {
      if (!edgesByNode.has(e.from)) edgesByNode.set(e.from, []);
      if (!edgesByNode.has(e.to)) edgesByNode.set(e.to, []);
      edgesByNode.get(e.from).push(e);
      edgesByNode.get(e.to).push(e);
    }

    // 古参順位: restId 数値昇順 (BigInt 比較)。 自分(self)は除外。
    // フィルタ「上位 N 選」 の rank として使う。
    const oldRanks = new Map();
    const sortableByOld = [];
    for (const n of graph.nodes) {
      if (n.isSelf || !n.restId) continue;
      try { sortableByOld.push({ n, key: BigInt(n.restId) }); } catch {}
    }
    sortableByOld.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    sortableByOld.forEach((x, i) => oldRanks.set(x.n.id, i + 1));
    const nodeIndex = new Map(); // id -> i
    graph.nodes.forEach((n, i) => nodeIndex.set(n.id, i));

    // Edges: LineSegments with vertex colors — inky thin lines on white
    const edgeGeom = new THREE.BufferGeometry();
    const edgeMat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: T.edgeOpacity,
      depthWrite: false,
    });
    const edgeLines = new THREE.LineSegments(edgeGeom, edgeMat);
    scene.add(edgeLines);

    // Curved edges (alternate rendering)
    const curveGroup = new THREE.Group();
    curveGroup.visible = false;
    scene.add(curveGroup);

    // Flowing particles on edges (alternate rendering)
    const flowGroup = new THREE.Group();
    flowGroup.visible = false;
    scene.add(flowGroup);

    // Cluster LOD orbs — shown when zoomed out in 'cluster' view mode
    const clusterGroup = new THREE.Group();
    clusterGroup.visible = false;
    scene.add(clusterGroup);
    function rebuildClusterOrbs() {
      while (clusterGroup.children.length) {
        const c = clusterGroup.children.pop();
        c.geometry && c.geometry.dispose && c.geometry.dispose();
        c.material && c.material.dispose && c.material.dispose();
      }
      for (const c of clusters.values()) {
        const size = Math.min(8, 1.4 + Math.log10(c.members.size + c.d2members.size + 1) * 2.2);
        const geom = new THREE.SphereGeometry(size, 24, 20);
        const mat = new THREE.MeshStandardMaterial({
          color: c.color, emissive: c.color, emissiveIntensity: 0.45,
          roughness: 0.35, metalness: 0.15, transparent: true, opacity: 0.88,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.copy(c.center);
        mesh.userData = { clusterId: c.id, count: c.members.size + c.d2members.size };
        clusterGroup.add(mesh);
        // halo ring
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(size * 1.5, size * 1.7, 40),
          new THREE.MeshBasicMaterial({ color: c.color, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
        );
        ring.position.copy(c.center);
        ring.lookAt(0, c.center.y, 0);
        clusterGroup.add(ring);
      }
    }

    // ─── Build positions + fill instance data ──────────────────────────
    let currentLayout = opts.layout || 'sphere';
    let currentEdgeStyle = opts.edgeStyle || 'straight';
    let currentFilter = {
      minFollowers: 0, maxFollowers: Infinity,
      minFollows: 0, maxFollows: Infinity,
      minStatuses: 0, maxStatuses: Infinity,
      // アカウント作成順位の範囲 (1=最古、 oldRanks.size=最新)
      minRank: 0, maxRank: Infinity,
      onlyVerified: false,
      dateMin: 0, dateMax: Infinity,
    };
    // 「特定ノード集合だけ表示」 用 whitelist。 null なら無効。
    let nodeWhitelist = null;

    // 「現在の中心ユーザー」 (reroot で動的に変わる) との関係性。
    // - centerMutuals: 中心と相互フォロー
    // - centerFollowOnly: 中心 → 相手 (相手は返してない)
    // - centerFollowerOnly: 相手 → 中心 (中心は返してない)
    // 起動時は self、 reroot 時に切り替え + 再計算。
    let centerId = (graph.nodes.find(n => n.isSelf) || {}).id;
    let centerMutuals = new Set();
    let centerFollowOnly = new Set();
    let centerFollowerOnly = new Set();

    function recomputeCenterRelations() {
      centerMutuals = new Set();
      centerFollowOnly = new Set();
      centerFollowerOnly = new Set();
      const arr = edgesByNode.get(centerId) || [];
      const fromCenter = new Set();
      const toCenter = new Set();
      for (const e of arr) {
        if (e.from === centerId) fromCenter.add(e.to);
        if (e.to === centerId) toCenter.add(e.from);
      }
      for (const id of fromCenter) {
        if (toCenter.has(id)) centerMutuals.add(id);
        else centerFollowOnly.add(id);
      }
      for (const id of toCenter) {
        if (!fromCenter.has(id)) centerFollowerOnly.add(id);
      }
    }
    recomputeCenterRelations(); // 初回
    let nodeScale = opts.nodeScale ?? 1;
    let labelsOn = opts.labelsOn ?? false;
    let sizeMetric = opts.sizeMetric || 'followers'; // 'followers'|'ffratio'|'statuses'|'fixed'
    let densityLimit = opts.densityLimit ?? Infinity; // max visible d1+d2 nodes (by importance)
    let importanceMetric = opts.importanceMetric || 'followers';
    // エッジ表示モード:
    //   'select' (デフォルト) — ホバー/選択/ピン留めしたノードに繋がるエッジのみ表示
    //   'all' — 全エッジ常時表示 (重い、12万本だと埋まる)
    //   'far' — エッジ長 > edgeFarThreshold のもののみ表示 (= クラスタ間の橋を強調)
    let edgeVisibilityMode = opts.edgeMode || 'select';
    let edgeFarThreshold = opts.edgeFarThreshold ?? 70;

    // Importance ranking used by density limiter.
    // Self + d1 always visible; d2 is ranked and capped.
    function importanceOf(n) {
      if (n.isSelf) return Infinity;
      if (n.depth === 1) return Infinity;
      switch (importanceMetric) {
        case 'ffratio': return n.follows ? (n.followers / n.follows) : 0;
        case 'statuses': return n.statuses || 0;
        default: return n.followers || 0;
      }
    }
    // ─── Clustering (community detection, simplified) ──────────────────
    // Group depth-1 nodes by "who they share edges with" in a cheap pass,
    // then assign each depth-2 node to its parent-d1's cluster.
    const clusters = new Map(); // clusterId -> { id, members:Set, center:Vec3, color }
    const nodeCluster = new Map(); // nodeId -> clusterId
    function buildClusters() {
      clusters.clear(); nodeCluster.clear();
      // Seeds: group d1 nodes by relationship type (mutual/follow/follower) as coarse cluster
      // Then split each group into K by angular bucketing on their positions later.
      // For now: buckets by (kind + angular zone around self).
      const d1 = graph.nodes.filter(n => n.depth === 1);
      const BUCKET = 8; // 8 angular buckets × 3 kinds = up to 24 clusters
      function kindOf(n) {
        if (graph.mutuals.has(n.id)) return 'm';
        if (graph.followsOfMe.includes(n.id)) return 'f';
        return 'r';
      }
      for (const n of d1) {
        const p = nodePositions.get(n.id);
        let bucket = 0;
        if (p) { const a = Math.atan2(p.z, p.x); bucket = Math.floor(((a + Math.PI) / (Math.PI * 2)) * BUCKET) % BUCKET; }
        const cid = kindOf(n) + '-' + bucket;
        if (!clusters.has(cid)) {
          const col = kindOf(n) === 'm' ? T.mutual : (kindOf(n) === 'f' ? T.follow : T.follower);
          clusters.set(cid, { id: cid, members: new Set(), d2members: new Set(), center: new V3(), color: col });
        }
        clusters.get(cid).members.add(n.id);
        nodeCluster.set(n.id, cid);
      }
      // Assign d2 to their parent's cluster
      for (const n of graph.nodes) {
        if (n.depth !== 2) continue;
        const parent = n.parent;
        const cid = parent ? nodeCluster.get(parent) : null;
        if (cid && clusters.has(cid)) {
          clusters.get(cid).d2members.add(n.id);
          nodeCluster.set(n.id, cid);
        }
      }
      // Compute centroids
      for (const c of clusters.values()) {
        let x = 0, y = 0, z = 0, k = 0;
        for (const id of c.members) {
          const p = nodePositions.get(id); if (!p) continue;
          x += p.x; y += p.y; z += p.z; k++;
        }
        if (k) c.center.set(x / k, y / k, z / k);
      }
    }

    // ─── View mode & focus state ───────────────────────────────────────
    // modes: 'explore' (default), 'focus' (show 2-hop nbhd of focusId), 'path' (show path me→target)
    let viewMode = 'explore';
    let focusNodeId = null;
    let pathTargetId = null;
    const pinnedSet = new Set();
    let focusRing = null; // computed set of node ids in current focus
    let pathSet = null;   // set of edges on active path

    function computeFocusRing(rootId, hops = 2) {
      // edgesByNode で frontier 各ノードの隣接だけを走査 (旧: 全 edges × frontier 回)
      const ring = new Set([rootId]);
      let frontier = [rootId];
      for (let h = 0; h < hops; h++) {
        const next = [];
        for (const id of frontier) {
          const arr = edgesByNode.get(id) || [];
          for (const e of arr) {
            const other = e.from === id ? e.to : e.from;
            if (!ring.has(other)) { ring.add(other); next.push(other); }
          }
        }
        frontier = next;
      }
      return ring;
    }

    function computePath(srcId, dstId, maxHops = 4) {
      // BFS: edgesByNode で 1 hop あたりの計算量を O(全edges) → O(隣接数) へ
      if (srcId === dstId) return { nodes: new Set([srcId]), edges: new Set() };
      const prev = new Map([[srcId, null]]);
      const q = [srcId]; let found = false;
      while (q.length && !found) {
        const cur = q.shift();
        if (prev.size > 20000) break;
        const arr = edgesByNode.get(cur) || [];
        for (const e of arr) {
          const nxt = e.from === cur ? e.to : e.from;
          if (prev.has(nxt)) continue;
          prev.set(nxt, { node: cur, edge: e });
          if (nxt === dstId) { found = true; break; }
          q.push(nxt);
        }
      }
      if (!found) return null;
      const nodes = new Set(), edges = new Set();
      let cur = dstId;
      while (cur != null) {
        nodes.add(cur);
        const link = prev.get(cur);
        if (!link) break;
        edges.add(link.edge);
        cur = link.node;
      }
      return { nodes, edges };
    }

    let visibleSet = new Set();
    function recomputeVisible() {
      visibleSet = new Set();
      const d2 = [];
      for (const n of graph.nodes) {
        if (n.isSelf || n.depth === 1) { visibleSet.add(n.id); continue; }
        d2.push(n);
      }
      const filtered = d2.filter(n => followerInRange(n) && relationshipAllowed(n));
      filtered.sort((a, b) => importanceOf(b) - importanceOf(a));
      const cap = Math.min(filtered.length, densityLimit);
      for (let i = 0; i < cap; i++) visibleSet.add(filtered[i].id);
    }
    function followerInRange(n) {
      if (n.followers < currentFilter.minFollowers) return false;
      if (n.followers > currentFilter.maxFollowers) return false;
      return true;
    }
    function relationshipAllowed(n) {
      if (n.isSelf) return true;
      if (n.depth !== 1) return true;
      const isMutual = graph.mutuals.has(n.id);
      if (isMutual && !currentFilter.mutuals) return false;
      if (!isMutual && !currentFilter.oneway) return false;
      return true;
    }

    const tmpObj = new THREE.Object3D();
    const tmpColor = new THREE.Color();

    function colorFor(node) {
      if (node.isSelf) return new THREE.Color(T.self);
      if (node.depth === 1) {
        // tint by mutual/follow/follower
        if (graph.mutuals.has(node.id)) return new THREE.Color(T.mutual);
        if (graph.followsOfMe.includes(node.id)) return new THREE.Color(T.follow);
        if (graph.followersOfMe.includes(node.id)) return new THREE.Color(T.follower);
        return new THREE.Color(T.d1);
      }
      return new THREE.Color(T.d2);
    }

    function sizeFor(node) {
      // ノード径は画面占有を抑えるため抑制。
      // 重要度差(フォロワー対数)は残しつつ、最大でも従来の半分以下に。
      if (node.isSelf) return 1.4;
      const base = node.depth === 1 ? 0.18 : 0.12;
      let factor = 0.25;
      switch (sizeMetric) {
        case 'followers':
          factor = Math.min(1.0, Math.log10((node.followers || 0) + 10) * 0.22);
          break;
        case 'ffratio': {
          const r = node.follows ? (node.followers || 0) / node.follows : 0;
          factor = Math.min(1.1, 0.12 + Math.log10(r + 1) * 0.7);
          break;
        }
        case 'statuses':
          factor = Math.min(1.0, Math.log10((node.statuses || 0) + 10) * 0.18);
          break;
        case 'fixed':
          factor = 0.32;
          break;
      }
      return (base + factor) * nodeScale;
    }

    function applyLayout(name) {
      const fn = LAYOUTS[name] || LAYOUTS.sphere;
      const p = fn(graph);
      for (const [id, v] of p) nodePositions.set(id, v);
      recomputeVisible();
      buildClusters();
      rebuildClusterOrbs();
      rebuildInstances();
      rebuildEdges();
      updateAllAvatarPositions();
    }

    function updateAvatarPosition(nodeId) {
      const rec = avatarSprites.get(nodeId);
      if (!rec) return;
      const p = nodePositions.get(nodeId);
      if (!p) return;
      rec.sprite.position.set(p.x, p.y, p.z);
      const node = graph.byId.get(nodeId);
      if (node) {
        const s = sizeFor(node) * 2.2;
        rec.sprite.scale.set(s, s, 1);
      }
    }

    function updateAllAvatarPositions() {
      for (const id of avatarSprites.keys()) updateAvatarPosition(id);
    }

    // jpg などの背景つき画像を円形マスク + 細いリング枠で Canvas に描画してから
    // Texture 化する。SpriteMaterial にそのまま jpg を渡すと正方形タイルとして
    // 描画されて見栄えが悪い。
    function makeCircularAvatarTexture(img, ringColor) {
      // 96x96 でレンダリング(原画 73x73 の _bigger を少し拡大)。
      // Canvas を上げすぎると Texture メモリが膨らむのでこの程度に抑える。
      const size = 96;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      const r = size / 2;
      // 円形クリップ
      ctx.save();
      ctx.beginPath();
      ctx.arc(r, r, r - 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, 0, 0, size, size);
      ctx.restore();
      // 細いリング (関係性の色)
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(r, r, r - 2, 0, Math.PI * 2);
      ctx.stroke();
      const tex = new THREE.CanvasTexture(c);
      if ('SRGBColorSpace' in THREE) tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      return tex;
    }

    function ringColorForNode(node) {
      if (graph.mutuals.has(node.id)) return '#c44828'; // 相互
      if (graph.followsOfMe.includes(node.id)) return '#2a4a7a'; // 一方向
      return '#a8a098'; // その他
    }

    // 並列ロード版。各画像 5-15KB で軽いので concurrency を上げると一気に揃う。
    // 進捗をコンソールに出して「ロード中なのか張り付き失敗なのか」を切り分け可能に。
    function startAvatarLoading(opts = {}) {
      if (avatarLoaderActive) return;
      avatarLoaderActive = true;
      const limit = opts.limit ?? 500;
      const concurrency = opts.concurrency ?? 16;
      const queue = graph.nodes
        .filter(n => n.avatarUrl && !n.isSelf && !avatarSprites.has(n.id))
        .sort((a, b) => (b.followers || 0) - (a.followers || 0))
        .slice(0, limit);
      let cursor = 0, done = 0, ok = 0, fail = 0;

      function loadOne(node) {
        return new Promise(resolve => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            if (!avatarLoaderActive) { resolve(); return; }
            try {
              const tex = makeCircularAvatarTexture(img, ringColorForNode(node));
              const mat = new THREE.SpriteMaterial({
                map: tex, transparent: true,
                depthWrite: false, depthTest: true,
              });
              const sprite = new THREE.Sprite(mat);
              sprite.frustumCulled = false; // カメラ方向オフセットで一時的に外れる対策
              const p = nodePositions.get(node.id);
              if (p) sprite.position.set(p.x, p.y, p.z);
              const s = sizeFor(node) * 2.2;
              sprite.scale.set(s, s, 1);
              sprite.userData.nodeId = node.id;
              sprite.visible = isNodeVisible(node);
              avatarGroup.add(sprite);
              avatarSprites.set(node.id, { sprite, mat, tex });
              ok++;
            } catch (err) {
              // 円形マスク段階で tainted canvas (CORS失敗) になることがある
              fail++;
            }
            done++;
            resolve();
          };
          img.onerror = () => { fail++; done++; resolve(); };
          // _normal (48x48) → _bigger (73x73) で1.5倍解像度
          img.src = (node.avatarUrl || '').replace(/_normal\.(jpg|jpeg|png|webp)/i, '_bigger.$1');
        });
      }

      async function worker() {
        while (avatarLoaderActive && cursor < queue.length) {
          await loadOne(queue[cursor++]);
        }
      }

      const workers = [];
      for (let w = 0; w < concurrency; w++) workers.push(worker());
      Promise.all(workers).then(() => { avatarLoaderActive = false; });
    }

    // 球は元サイズのまま、avatar 有無での個別更新は不要になった(空関数 stub)。
    function rebuildInstancesForNode(_nodeId) {}

    function stopAvatarLoading() {
      avatarLoaderActive = false;
    }

    function disposeAvatars() {
      stopAvatarLoading();
      for (const { sprite, mat, tex } of avatarSprites.values()) {
        avatarGroup.remove(sprite);
        mat.dispose();
        tex.dispose();
      }
      avatarSprites.clear();
    }

    function rebuildInstances() {
      // In cluster mode: hide all individual nodes except self, show cluster orbs
      if (viewMode === 'cluster') {
        graph.nodes.forEach((n, i) => {
          if (n.isSelf) {
            const p = nodePositions.get(n.id) || { x: 0, y: 0, z: 0 };
            selfMesh.position.set(p.x, p.y, p.z);
            halo.position.set(p.x, p.y - 2.2, p.z);
            tmpObj.position.set(p.x, p.y, p.z);
            tmpObj.scale.setScalar(0.001);
            tmpObj.updateMatrix();
            instMesh.setMatrixAt(i, tmpObj.matrix);
            return;
          }
          tmpObj.position.set(0, -9999, 0);
          tmpObj.scale.setScalar(0.001);
          tmpObj.updateMatrix();
          instMesh.setMatrixAt(i, tmpObj.matrix);
        });
        clusterGroup.visible = true;
        instMesh.instanceMatrix.needsUpdate = true;
        return;
      }
      clusterGroup.visible = false;
      let count = 0;
      graph.nodes.forEach((n, i) => {
        const p = nodePositions.get(n.id) || { x: 0, y: 0, z: 0 };
        const visible = isNodeVisible(n);
        if (n.isSelf) {
          selfMesh.position.set(p.x, p.y, p.z);
          halo.position.set(p.x, p.y - 2.2, p.z);
          // self が中央 (= reroot されてない、 もしくは self に reroot) の時のみ
          // selfGroup (icosahedron + wireframe + glow) を表示。 他人を中心にした
          // 時は self ノードはふつうの球として控えめに描画。
          const selfIsCenter = (n.id === centerId);
          selfGroup.visible = selfIsCenter;
          halo.visible = selfIsCenter;
          if (selfIsCenter) {
            // 通常通り selfMesh を icosahedron 描画 + instMesh は隠す
            tmpObj.position.set(p.x, p.y, p.z);
            tmpObj.scale.setScalar(0.001);
            tmpObj.updateMatrix();
            instMesh.setMatrixAt(i, tmpObj.matrix);
          } else {
            // selfGroup 非表示なので、 ふつうのノードと同じく球で描画
            const s = visible ? sizeFor(n) : 0.001;
            tmpObj.position.set(p.x, p.y, p.z);
            tmpObj.scale.setScalar(s);
            tmpObj.updateMatrix();
            instMesh.setMatrixAt(i, tmpObj.matrix);
            const c = colorFor(n);
            instMesh.setColorAt(i, c);
          }
          return;
        }
        const emph = nodeEmphasis(n);
        const av = avatarSprites.get(n.id);
        // アバターが乗ってるノードの球は完全に隠す(画像だけで充分)。
        // アバター無しノードは従来通り球を表示。
        const s = visible && !av ? sizeFor(n) : 0.001;
        tmpObj.position.set(p.x, p.y, p.z);
        tmpObj.scale.setScalar(s);
        tmpObj.rotation.set(0, 0, 0);
        tmpObj.updateMatrix();
        instMesh.setMatrixAt(i, tmpObj.matrix);
        const c = colorFor(n);
        if (emph < 1) {
          const mix = Math.max(0.2, emph);
          c.r = c.r * mix + 0.96 * (1 - mix);
          c.g = c.g * mix + 0.93 * (1 - mix);
          c.b = c.b * mix + 0.88 * (1 - mix);
        }
        instMesh.setColorAt(i, c);
        if (av) {
          av.sprite.visible = visible;
          if (visible) {
            av.sprite.position.set(p.x, p.y, p.z);
            // アバターサイズは固定(球と同じく hover/select で変えない)
            // 中央ノード (reroot 先) のアバターは目立たせるため拡大
            const isCenter = n.id === centerId;
            const aSize = sizeFor(n) * 2.2 * (isCenter ? 2.5 : 1);
            av.sprite.scale.set(aSize, aSize, 1);
          }
        }
        if (visible) count++;
      });
      instMesh.instanceMatrix.needsUpdate = true;
      if (instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true;
    }

    // カメラに近接したノードを描画から外すしきい値(world unit)
    // この距離より近いノードは球もアバターも消す → 拡大されすぎた絵を回避
    const CULL_NEAR = 5;

    function isNodeNearCulled(n) {
      if (n.isSelf) return false;
      const p = nodePositions.get(n.id);
      if (!p) return false;
      const dx = camera.position.x - p.x;
      const dy = camera.position.y - p.y;
      const dz = camera.position.z - p.z;
      return (dx * dx + dy * dy + dz * dz) < CULL_NEAR * CULL_NEAR;
    }

    function isNodeVisible(n) {
      // 中心ノード (reroot 先) は常時表示。 self は中心でなければ普通にフィルタ対象。
      if (n.id === centerId) return true;
      if (!visibleSet.has(n.id)) return false;
      const f = currentFilter;
      const followers = n.followers || 0;
      const follows = n.follows || 0;
      const statuses = n.statuses || 0;
      if (followers < f.minFollowers || followers > f.maxFollowers) return false;
      if (follows < f.minFollows || follows > f.maxFollows) return false;
      if (statuses < f.minStatuses || statuses > f.maxStatuses) return false;
      if (f.onlyVerified && !n.verified) return false;
      // アカウント作成順位の範囲フィルタ (デフォルトは 0〜Infinity = 全通過)
      if (f.minRank > 0 || f.maxRank !== Infinity) {
        const r = oldRanks.get(n.id);
        if (!r || r < f.minRank || r > f.maxRank) return false;
      }
      // 選択ノードの被フォロー/フォロー/相互 から作られた whitelist で絞り込み
      if (nodeWhitelist && !nodeWhitelist.has(n.id)) return false;
      // View mode gating — hard hide non-ring in focus / non-path in path
      if (viewMode === 'focus' && focusRing && !focusRing.has(n.id)) return false;
      if (viewMode === 'path' && pathSet && !pathSet.nodes.has(n.id)) return false;
      // 近接 culling
      if (isNodeNearCulled(n)) return false;
      return true;
    }
    function nodeEmphasis(n) {
      if (n.isSelf) return 1.2;
      if (hoveredId === n.id) return 1.25;
      if (selectedId === n.id) return 1.15;
      if (pinnedSet.has(n.id)) return 1.1;
      if (viewMode === 'focus' && focusRing && focusRing.has(n.id)) return 1.0;
      if (viewMode === 'path' && pathSet && pathSet.nodes.has(n.id)) return 1.1;
      return 0.7; // faded / ambient
    }

    function isEdgeVisible(e) {
      const a = graph.byId.get(e.from), b = graph.byId.get(e.to);
      if (!a || !b) return false;
      if (!isNodeVisible(a) || !isNodeVisible(b)) return false;
      if (e.since < currentFilter.dateMin) return false;
      if (e.since > currentFilter.dateMax) return false;
      // View-mode gating (focus/path はモードを問わず最優先)
      if (viewMode === 'focus' && focusRing) {
        if (!focusRing.has(e.from) || !focusRing.has(e.to)) return false;
      }
      if (viewMode === 'path' && pathSet) {
        return pathSet.edges.has(e);
      }
      // エッジ表示モードによる絞り込み
      if (edgeVisibilityMode === 'all') return true;
      if (edgeVisibilityMode === 'far') {
        const pa = nodePositions.get(e.from), pb = nodePositions.get(e.to);
        if (!pa || !pb) return false;
        const dx = pa.x - pb.x, dy = pa.y - pb.y, dz = pa.z - pb.z;
        return (dx * dx + dy * dy + dz * dz) >= edgeFarThreshold * edgeFarThreshold;
      }
      // edgeVisibilityMode === 'select' (デフォルト)
      // ホバー/選択/ピンに該当するノードに繋がるエッジのみ表示
      if (hoveredId && (e.from === hoveredId || e.to === hoveredId)) return true;
      if (selectedId && (e.from === selectedId || e.to === selectedId)) return true;
      if (pinnedSet.size && (pinnedSet.has(e.from) || pinnedSet.has(e.to))) return true;
      return false;
    }
    function edgeEmphasis(e) {
      // 0 = dim / ambient, 1 = solid。 hover/select でも全体的に控えめに。
      if (viewMode === 'path' && pathSet && pathSet.edges.has(e)) return 0.9;
      if (hoveredId && (e.from === hoveredId || e.to === hoveredId)) return 0.45;
      if (selectedId && (e.from === selectedId || e.to === selectedId)) return 0.4;
      if (pinnedSet.size && (pinnedSet.has(e.from) || pinnedSet.has(e.to))) return 0.35;
      if (viewMode === 'focus') return 0.5;
      return 0.2; // ambient
    }

    function colorForEdge(e) {
      if (e.mutual) return new THREE.Color(T.mutual);
      if (e.kind === 'follow') return new THREE.Color(T.follow);
      return new THREE.Color(T.follower);
    }

    function rebuildEdges() {
      // Straight (LineSegments) — with depth fade + emphasis via per-vertex alpha baked into color
      const positions = [];
      const colors = [];
      curveGroup.clear();
      flowGroup.clear();

      const camPos = camera.position;
      const FADE_NEAR = 20, FADE_FAR = 160;

      // 'select' モードでは hover/select/pinned に該当するノードの接続 edges だけを
      // 候補集合に集めて走査。 全 edges を走査する代わり O(該当ノードの接続数)。
      // viewMode='path' は pathSet.edges 限定、 'focus' は focusRing 内ノードに限定 → これらも候補限定可能。
      let candidateEdges;
      if (viewMode === 'path' && pathSet) {
        candidateEdges = pathSet.edges;
      } else if (edgeVisibilityMode === 'select' && viewMode !== 'focus') {
        const set = new Set();
        const addFor = id => {
          const arr = id && edgesByNode.get(id);
          if (arr) for (const e of arr) set.add(e);
        };
        addFor(hoveredId);
        addFor(selectedId);
        for (const id of pinnedSet) addFor(id);
        candidateEdges = set;
      } else {
        candidateEdges = graph.edges;
      }

      for (const e of candidateEdges) {
        if (!isEdgeVisible(e)) continue;
        const a = nodePositions.get(e.from);
        const b = nodePositions.get(e.to);
        if (!a || !b) continue;
        const col = colorForEdge(e);
        const emph = edgeEmphasis(e);
        // Depth fade: farther edges become paler (blend toward bg)
        const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2, midZ = (a.z + b.z) / 2;
        const dx = midX - camPos.x, dy = midY - camPos.y, dz = midZ - camPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const depthF = 1 - Math.min(1, Math.max(0, (dist - FADE_NEAR) / (FADE_FAR - FADE_NEAR))) * 0.7;
        const mix = Math.min(1, emph * depthF);
        // Blend color toward near-white based on (1-mix) so dim edges recede
        const r = col.r * mix + 0.96 * (1 - mix);
        const g = col.g * mix + 0.93 * (1 - mix);
        const bb = col.b * mix + 0.88 * (1 - mix);
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        colors.push(r, g, bb, r, g, bb);

        if (currentEdgeStyle === 'curved' || currentEdgeStyle === 'flow') {
          // Edge bundling: bend toward the midpoint between the two nodes' cluster centroids
          const ca = nodeCluster.get(e.from), cb = nodeCluster.get(e.to);
          const cca = ca && clusters.get(ca); const ccb = cb && clusters.get(cb);
          let mid;
          if (cca && ccb && cca !== ccb) {
            const mx = (cca.center.x + ccb.center.x) / 2;
            const my = (cca.center.y + ccb.center.y) / 2 + 4;
            const mz = (cca.center.z + ccb.center.z) / 2;
            mid = new V3(mx, my, mz);
          } else if (cca) {
            // Both in same cluster: bend toward cluster center to bundle in-group edges
            mid = new V3(cca.center.x, cca.center.y + 2, cca.center.z);
          } else {
            mid = new V3(midX, midY + 4, midZ);
          }
          const curve = new THREE.QuadraticBezierCurve3(new V3(a.x, a.y, a.z), mid, new V3(b.x, b.y, b.z));
          const pts = curve.getPoints(14);
          const g2 = new THREE.BufferGeometry().setFromPoints(pts);
          const m = new THREE.LineBasicMaterial({ color: new THREE.Color(r, g, bb), transparent: true, opacity: T.edgeOpacity * 1.1 * mix + 0.05 });
          curveGroup.add(new THREE.Line(g2, m));

          if (currentEdgeStyle === 'flow' && mix > 0.6) {
            for (let i = 0; i < 3; i++) {
              const dot = new THREE.Mesh(
                new THREE.SphereGeometry(0.22, 6, 6),
                new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9 })
              );
              dot.userData = { curve, phase: Math.random() };
              flowGroup.add(dot);
            }
          }
        }
      }
      edgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      edgeGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      edgeGeom.computeBoundingSphere();

      edgeLines.visible = currentEdgeStyle === 'straight';
      curveGroup.visible = currentEdgeStyle === 'curved' || currentEdgeStyle === 'flow';
      flowGroup.visible = currentEdgeStyle === 'flow';
    }

    // ─── Label sprites (for highlighted / nearby nodes) ────────────────
    const labelLayer = document.createElement('div');
    labelLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
    container.appendChild(labelLayer);

    const labelPool = [];
    function getLabel() {
      let el = labelPool.pop();
      if (!el) {
        el = document.createElement('div');
        el.style.cssText = `position:absolute;transform:translate(-50%,-150%);font:500 11px/1.2 "Noto Sans JP",system-ui,sans-serif;color:${T.labelColor};white-space:nowrap;padding:2px 6px;background:rgba(255,255,255,0.55);backdrop-filter:blur(4px);border-radius:2px;letter-spacing:0.02em;`;
        labelLayer.appendChild(el);
      }
      el.style.display = 'block';
      return el;
    }
    function releaseLabel(el) { el.style.display = 'none'; labelPool.push(el); }

    // ─── Interaction: raycasting ───────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 1 };
    const mouse = new THREE.Vector2();
    let hoveredId = null;
    let selectedId = null;

    const handlers = { hover: () => {}, click: () => {}, dblclick: () => {}, interact: () => {}, pan: () => {}, center: () => {} };

    // ユーザー操作 (drag/wheel) を一元的に処理: focus アニメ中断 + 外部通知
    controls.onInteract = () => {
      focusTarget = null; // 自動カメラ移動中なら即停止 (手動操作優先)
      handlers.interact();
    };
    controls.onPan = () => handlers.pan();

    function pick(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      // 1. Avatar Sprite を最優先。 ただし visible/フィルタ通過のノードのみ。
      const avatarHits = raycaster.intersectObjects(avatarGroup.children);
      for (const hit of avatarHits) {
        const sprite = hit.object;
        if (!sprite.visible) continue;
        const id = sprite.userData?.nodeId;
        if (!id) continue;
        const node = graph.byId.get(id);
        if (node && isNodeVisible(node)) return node;
      }
      // 2. アバター無しノードは球で判定。 同様に isNodeVisible チェック。
      const hits = raycaster.intersectObject(instMesh);
      for (const hit of hits) {
        const inst = hit.instanceId;
        if (inst == null) continue;
        const node = graph.nodes[inst];
        if (node && isNodeVisible(node)) return node;
      }
      // 3. Self (id は rootHandle、 'me' ではない)
      const selfHits = raycaster.intersectObject(selfMesh);
      if (selfHits.length) {
        const selfNode = graph.nodes.find(n => n.isSelf);
        if (selfNode) return selfNode;
      }
      return null;
    }

    // edgeVisibilityMode='select' のとき hover/select 変化で表示エッジが変わるため、
    // 1フレに1回だけ rebuildEdges をスケジュール (12万エッジを毎ポインタ移動で
    // 再構築するとカクつくため)。
    let edgeRebuildPending = false;
    function scheduleEdgeRebuild() {
      if (edgeRebuildPending) return;
      edgeRebuildPending = true;
      requestAnimationFrame(() => { edgeRebuildPending = false; rebuildEdges(); });
    }

    renderer.domElement.addEventListener('pointermove', (e) => {
      const n = pick(e);
      const id = n ? n.id : null;
      if (id !== hoveredId) {
        hoveredId = id;
        handlers.hover(n, e);
        renderer.domElement.style.cursor = n ? 'pointer' : 'grab';
        if (edgeVisibilityMode === 'select') scheduleEdgeRebuild();
      }
    });

    // クリック判定: pointerdown と pointerup が「同じノード」かつ「移動量が閾値以下」
    // のとき「クリック」とみなす。これにより、ドラッグして離した位置のノードが
    // 誤選択される問題を解消。
    let downAt = null; // { x, y, id, time }
    let lastClickTime = 0;
    let lastClickId = null;
    const CLICK_MOVE_THRESHOLD = 5; // px
    const DBL_CLICK_INTERVAL = 280; // ms

    renderer.domElement.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) { downAt = null; return; } // 左クリック以外は無視
      const n = pick(e);
      downAt = { x: e.clientX, y: e.clientY, id: n ? n.id : null, time: performance.now() };
    });

    renderer.domElement.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || !downAt) { downAt = null; return; }
      const dx = e.clientX - downAt.x;
      const dy = e.clientY - downAt.y;
      const moved = Math.sqrt(dx * dx + dy * dy);
      const downId = downAt.id;
      downAt = null;
      if (moved > CLICK_MOVE_THRESHOLD) return; // ドラッグ → クリック扱いしない

      const upNode = pick(e);
      const upId = upNode ? upNode.id : null;
      if (upId !== downId) return; // down と up で異なるノード → 無視

      const now = performance.now();
      const dbl = upNode && (now - lastClickTime < DBL_CLICK_INTERVAL) && lastClickId === upId;
      lastClickTime = now;
      lastClickId = upId;

      if (upNode) {
        selectedId = upNode.id;
        if (dbl) handlers.dblclick(upNode);
        else handlers.click(upNode, e);
      } else {
        selectedId = null;
        handlers.click(null, e);
      }
      if (edgeVisibilityMode === 'select') scheduleEdgeRebuild();
    });

    // ─── Animation loop ────────────────────────────────────────────────
    let rafId;
    let frame = 0;
    let focusTarget = null; // {target: Vector3, dist}
    let lastCamRebuild = 0;
    const lastCamPos = new THREE.Vector3(9999, 9999, 9999);
    function animate() {
      rafId = requestAnimationFrame(animate);
      frame++;
      controls.update();

      // Rebuild edges + instances when camera moved meaningfully (for depth-fade
      // と 近接 culling 反映) — throttled
      if (frame - lastCamRebuild > 6) {
        const d = camera.position.distanceTo(lastCamPos);
        if (d > 2) {
          lastCamPos.copy(camera.position);
          lastCamRebuild = frame;
          rebuildInstances();
          rebuildEdges();
        }
      }

      // Avatar の位置補正 + 距離フェード(毎フレ、~3000 sprite で軽い)
      // - オフセットは「現在の球の半径 (emph 連動)」+ 余裕。固定 sizeFor だと
      //   hover/select で球が膨張したとき球がアバターを通り抜けてはみ出す。
      // - 同時にカメラ距離で opacity 減衰(奥が薄く)
      if (avatarSprites.size > 0) {
        const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
        const NEAR = 50, FAR = 140, MIN_OP = 0.12;
        for (const [nodeId, { sprite, mat }] of avatarSprites) {
          if (!sprite.visible) continue;
          const node = graph.byId.get(nodeId);
          const p = nodePositions.get(nodeId);
          if (!node || !p) continue;
          const dx = cx - p.x, dy = cy - p.y, dz = cz - p.z;
          const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (len > 0.001) {
            // 球サイズは固定なのでオフセットも固定値(球の半径 + 余裕)
            const sphereRadius = sizeFor(node);
            const offset = Math.min(sphereRadius + 0.15, len * 0.5);
            const inv = offset / len;
            sprite.position.set(p.x + dx * inv, p.y + dy * inv, p.z + dz * inv);
          }
          if (frame % 3 === 0) {
            let op;
            if (len <= NEAR) op = 1;
            else if (len >= FAR) op = MIN_OP;
            else op = 1 - ((len - NEAR) / (FAR - NEAR)) * (1 - MIN_OP);
            if (Math.abs(mat.opacity - op) > 0.02) mat.opacity = op;
          }
        }
      }

      // Focus tween
      if (focusTarget) {
        controls.target.lerp(focusTarget.target, 0.08);
        const dir = camera.position.clone().sub(controls.target).normalize();
        const desiredPos = controls.target.clone().add(dir.multiplyScalar(focusTarget.dist));
        camera.position.lerp(desiredPos, 0.08);
        if (camera.position.distanceTo(desiredPos) < 0.3) focusTarget = null;
      }

      // Flowing particles
      if (flowGroup.visible) {
        flowGroup.children.forEach((dot) => {
          const ud = dot.userData;
          ud.phase = (ud.phase + 0.008) % 1;
          const p = ud.curve.getPoint(ud.phase);
          dot.position.copy(p);
        });
      }

      // Self orb: breathing + wireframe drift + glow pulse
      const pulse = 1 + Math.sin(frame * 0.02) * 0.04;
      selfMesh.scale.setScalar(pulse);
      selfMesh.rotation.y += 0.004;
      selfMesh.rotation.x += 0.002;
      wireOrb.rotation.y -= 0.006;
      wireOrb.rotation.x += 0.003;
      wireOrb.scale.setScalar(1 + Math.sin(frame * 0.015) * 0.06);
      selfGlow.material.opacity = 0.45 + Math.sin(frame * 0.03) * 0.12;

      halo.rotation.z += 0.0035;

      // 選択ノードのグロウ:常時表示・脈動・強め
      if (selectedId && selectedId !== 'me') {
        const p = nodePositions.get(selectedId);
        const sNode = graph.byId.get(selectedId);
        if (p && sNode) {
          selGlow.position.set(p.x, p.y, p.z);
          const glowSize = sizeFor(sNode) * 3.6;
          selGlow.scale.set(glowSize, glowSize, 1);
          selGlow.material.opacity = 0.45 + Math.sin(frame * 0.05) * 0.12;
          selGlow.visible = true;
        } else selGlow.visible = false;
      } else selGlow.visible = false;

      // ホバーノードのグロウ:select と同じノードでない時だけ別途表示・控えめ
      if (hoveredId && hoveredId !== 'me' && hoveredId !== selectedId) {
        const p = nodePositions.get(hoveredId);
        const hNode = graph.byId.get(hoveredId);
        if (p && hNode) {
          hoverGlow.position.set(p.x, p.y, p.z);
          const glowSize = sizeFor(hNode) * 3.0;
          hoverGlow.scale.set(glowSize, glowSize, 1);
          hoverGlow.material.opacity = 0.22;
          hoverGlow.visible = true;
        } else hoverGlow.visible = false;
      } else hoverGlow.visible = false;

      // 中心マーカー: self 中心の時は selfGroup が役割を担うので非表示。
      // 他人中心の時、 selGlow と同じシンプルな光エフェクトを中心ノードに重ねる。
      const selfNodeId = (graph.nodes.find(n => n.isSelf) || {}).id;
      if (centerId && centerId !== selfNodeId) {
        const cp = nodePositions.get(centerId);
        const cn = graph.byId.get(centerId);
        if (cp && cn) {
          centerGlow.position.set(cp.x, cp.y, cp.z);
          const glowSize = sizeFor(cn) * 5.6; // 中心アバター(2.2*2.5=5.5) の少し外
          centerGlow.scale.set(glowSize, glowSize, 1);
          centerGlow.material.opacity = 0.45 + Math.sin(frame * 0.05) * 0.12;
          centerGlow.visible = true;
        } else centerGlow.visible = false;
      } else centerGlow.visible = false;

      // Labels: show for hovered, selected, self, and close nodes if labelsOn
      updateLabels();

      renderer.render(scene, camera);
    }

    // Reusable labels
    const activeLabels = new Map(); // id -> el
    function updateLabels() {
      const needed = new Set();
      function want(id) {
        if (!id) return;
        const n = graph.byId.get(id); if (!n) return;
        const p = nodePositions.get(id); if (!p) return;
        const v = new V3(p.x, p.y, p.z).project(camera);
        if (v.z > 1) return;
        needed.add(id);
        let el = activeLabels.get(id);
        if (!el) { el = getLabel(); activeLabels.set(id, el); }
        const name = n.isSelf ? 'あなた' : (n.name + ' · @' + n.handle);
        if (el.textContent !== name) el.textContent = name;
        const x = (v.x * 0.5 + 0.5) * W();
        const y = (-v.y * 0.5 + 0.5) * H();
        el.style.left = x + 'px'; el.style.top = y + 'px';
      }
      // 選択時のラベル表示は撤廃(UIノイズ防止)。 詳細は右パネルで確認できる。

      if (labelsOn) {
        // Show labels for d1 nodes within camera distance
        const camPos = camera.position;
        for (const n of graph.nodes) {
          if (n.isSelf || n.depth > 1) continue;
          const p = nodePositions.get(n.id); if (!p) continue;
          const dx = p.x - camPos.x, dy = p.y - camPos.y, dz = p.z - camPos.z;
          const d = Math.sqrt(dx*dx+dy*dy+dz*dz);
          if (d < 45 && isNodeVisible(n)) want(n.id);
        }
      }

      // Remove unused
      for (const [id, el] of activeLabels) {
        if (!needed.has(id)) { releaseLabel(el); activeLabels.delete(id); }
      }
    }

    // ─── Public API ────────────────────────────────────────────────────
    function focus(nodeId, opts = {}) {
      const p = nodePositions.get(nodeId);
      if (!p) return;
      const n = graph.byId.get(nodeId);
      // 寄りすぎると操作感度(ホイール/パン)が極端に低くなるので 50〜60 程度を保つ
      const dist = opts.dist ?? (n && n.isSelf ? 90 : 55);
      focusTarget = { target: new V3(p.x, p.y, p.z), dist };
      selectedId = nodeId;
    }

    function reroot(nodeId) {
      // 任意のノードを中心に再配置。layoutSphere と同じ流儀:
      // - 中心 = 指定ノード
      // - 内側(隣接, 親しい人) と 外側(それ以外) の2層 + ハッシュで球内に散らす
      // - y軸はフォロワー対数で立体感を出す
      const pos = new Map();
      pos.set(nodeId, { x: 0, y: 0, z: 0 });

      const arr = edgesByNode.get(nodeId) || [];
      const neighSet = new Set();
      for (const e of arr) {
        const other = e.from === nodeId ? e.to : e.from;
        neighSet.add(other);
      }

      const inner = [], outer = [];
      for (const n of graph.nodes) {
        if (n.id === nodeId) continue;
        (neighSet.has(n.id) ? inner : outer).push(n);
      }

      // 隣接数に応じて内側半径を動的調整。 self中心(R=45) を上限とし、 少ない時は近づける。
      // N=10 → 15、 N=50 → 18、 N=100 → 25、 N=400 → 45(上限)
      const N = inner.length;
      const innerR = Math.max(15, Math.min(45, Math.sqrt(N) * 2.5));
      const outerR = Math.max(80, innerR * 2.4);

      function hashStr(s) {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
        return Math.abs(h);
      }
      function placeShell(arr, rNominal) {
        if (arr.length === 0) return;
        const fol = arr.map(n => Math.log10(1 + (n.followers || 0)));
        const fmin = Math.min(...fol), fmax = Math.max(...fol);
        const range = Math.max(fmax - fmin, 0.001);
        const phi = Math.PI * (Math.sqrt(5) - 1);
        arr.forEach((n, i) => {
          const norm = (Math.log10(1 + (n.followers || 0)) - fmin) / range;
          const y = (norm - 0.5) * rNominal * 1.4;
          const h = hashStr(n.id);
          const th = phi * i + ((h % 1000) / 159);
          const r = rNominal * (0.75 + 0.4 * ((h % 1000) / 1000));
          const h2 = Math.max(r * r - y * y, r * r * 0.15);
          const horizR = Math.sqrt(h2);
          pos.set(n.id, {
            x: Math.cos(th) * horizR,
            y,
            z: Math.sin(th) * horizR,
          });
        });
      }
      placeShell(inner, innerR);
      placeShell(outer, outerR);

      // 中心ユーザーを更新 + 関係性を再計算 + React に通知
      centerId = nodeId;
      recomputeCenterRelations();
      handlers.center?.(nodeId);

      for (const [id, v] of pos) nodePositions.set(id, v);
      recomputeVisible();
      rebuildInstances();
      rebuildEdges();
      updateAllAvatarPositions();
      // カメラ距離も innerR に連動。 少ない時はぐっと近づく。
      const cameraDist = Math.max(35, Math.min(160, innerR * 2));
      focus(nodeId, { dist: cameraDist });
      // reroot 後は中心ノードのエッジが常時表示されると重くなるので選択解除。
      // (React 側の詳細パネルは別 state なので残る、 ホバー時にエッジは出る)
      selectedId = null;
      rebuildEdges();
    }

    function onResize() {
      camera.aspect = W() / H();
      camera.updateProjectionMatrix();
      renderer.setSize(W(), H());
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    // Kick off
    applyLayout(currentLayout);
    rebuildEdges();
    animate();
    // Avatar の順次ロード(初期描画完了後、少し遅延して開始)
    setTimeout(() => startAvatarLoading({ limit: Infinity, concurrency: 16 }), 200);

    return {
      scene, camera, renderer, controls,
      getPositions: () => nodePositions,
      setLayout(name) { currentLayout = name; applyLayout(name); },
      setEdgeStyle(name) { currentEdgeStyle = name; rebuildEdges(); },
      setEdgeMode(mode) { edgeVisibilityMode = mode || 'select'; rebuildEdges(); },
      setEdgeFarThreshold(t) { edgeFarThreshold = t; if (edgeVisibilityMode === 'far') rebuildEdges(); },
      setFilter(f) {
        Object.assign(currentFilter, f);
        recomputeVisible();
        rebuildInstances();
        rebuildEdges();
        // 表示件数を返す(self を除く可視ノード数)
        let count = 0;
        for (const n of graph.nodes) if (!n.isSelf && isNodeVisible(n)) count++;
        return count;
      },
      getVisibleCount() {
        let count = 0;
        for (const n of graph.nodes) if (!n.isSelf && isNodeVisible(n)) count++;
        return count;
      },
      // メタデータの max を返す(UI スライダーの上限値設定用)
      getMetaRanges() {
        let maxFollowers = 0, maxFollows = 0, maxStatuses = 0, oldestCount = oldRanks.size;
        let verifiedCount = 0;
        for (const n of graph.nodes) {
          if (n.isSelf) continue;
          if ((n.followers || 0) > maxFollowers) maxFollowers = n.followers;
          if ((n.follows || 0) > maxFollows) maxFollows = n.follows;
          if ((n.statuses || 0) > maxStatuses) maxStatuses = n.statuses;
          if (n.verified) verifiedCount++;
        }
        return { maxFollowers, maxFollows, maxStatuses, oldestCount, verifiedCount };
      },
      setDensity(n) {
        densityLimit = n;
        recomputeVisible(); rebuildInstances(); rebuildEdges();
      },
      setSizeMetric(m) { sizeMetric = m; rebuildInstances(); },
      setImportanceMetric(m) { importanceMetric = m; recomputeVisible(); rebuildInstances(); rebuildEdges(); },
      setAutoRotate(b) { controls.autoRotate = !!b; },
      setLabels(b) { labelsOn = !!b; },
      setNodeScale(s) { nodeScale = s; rebuildInstances(); },
      setEmissive(s) {
        nodeMat.emissive = new THREE.Color(T.mutual);
        nodeMat.emissiveIntensity = s;
        nodeMat.needsUpdate = true;
      },
      focus, reroot,
      // 視点を「現在の中心ユーザー」 に戻す。 パンで target がずれた時の復帰用。
      // reroot で他人を中心にしている場合はその人へ、 そうでなければ self へ。
      // 距離はカメラの現在距離を維持(寄りすぎ・離れすぎを防ぐため上下限あり)。
      resetView() {
        const p = nodePositions.get(centerId);
        if (!p) return;
        const curDist = camera.position.distanceTo(controls.target);
        const dist = Math.max(40, Math.min(180, curDist));
        focus(centerId, { dist });
        selectedId = null;
        rebuildEdges();
      },
      setViewMode(mode) {
        viewMode = mode || 'explore';
        if (viewMode !== 'focus') focusRing = null;
        if (viewMode !== 'path') pathSet = null;
        rebuildInstances(); rebuildEdges();
      },
      setFocusNode(nodeId, hops = 2) {
        focusNodeId = nodeId;
        focusRing = nodeId ? computeFocusRing(nodeId, hops) : null;
        if (focusRing) viewMode = 'focus';
        rebuildInstances(); rebuildEdges();
      },
      setPathTarget(nodeId) {
        pathTargetId = nodeId;
        const me = graph.nodes.find(n => n.isSelf);
        if (me && nodeId) {
          pathSet = computePath(me.id, nodeId, 4);
          if (pathSet) viewMode = 'path';
        } else { pathSet = null; }
        rebuildInstances(); rebuildEdges();
      },
      setPinned(ids) {
        pinnedSet.clear();
        (ids || []).forEach(id => pinnedSet.add(id));
        rebuildInstances(); rebuildEdges();
      },
      togglePin(id) {
        if (pinnedSet.has(id)) pinnedSet.delete(id); else pinnedSet.add(id);
        rebuildInstances(); rebuildEdges();
      },
      getClusters() { return clusters; },
      getNodeCluster() { return nodeCluster; },
      onNodeHover(cb) { handlers.hover = cb; },
      onNodeClick(cb) { handlers.click = cb; },
      onNodeDblClick(cb) { handlers.dblclick = cb; },
      onInteract(cb) { handlers.interact = cb; },
      onPan(cb) { handlers.pan = cb; },
      onCenterChange(cb) { handlers.center = cb; },
      getCenterId() { return centerId; },
      getCenterRelations() {
        return {
          mutuals: centerMutuals.size,
          followOnly: centerFollowOnly.size,
          followerOnly: centerFollowerOnly.size,
        };
      },
      // 任意ノードの 被フォロー / フォロー / 相互 集合(=その node id を含む Set)
      // mutual edge は (a,b) でソートされて 1 entry にまとめられているため、
      // 'in'/'out' 判定は e.mutual も含める(相互ノードは 双方向で繋がっている)。
      getNodeRelationSet(nodeId, type) {
        const arr = edgesByNode.get(nodeId) || [];
        const set = new Set([nodeId]);
        for (const e of arr) {
          const other = e.from === nodeId ? e.to : e.from;
          if (type === 'in') {
            if (e.to === nodeId || e.mutual) set.add(other);
          } else if (type === 'out') {
            if (e.from === nodeId || e.mutual) set.add(other);
          } else if (type === 'mutual') {
            if (e.mutual) set.add(other);
          }
        }
        return set;
      },
      // ノード whitelist によるフィルタ。 null で解除。
      setNodeFilter(setOrNull) {
        nodeWhitelist = (setOrNull && typeof setOrNull.has === 'function') ? setOrNull : null;
        recomputeVisible();
        rebuildInstances();
        rebuildEdges();
      },
      getTheme() { return T; },
      dispose() {
        cancelAnimationFrame(rafId);
        ro.disconnect();
        disposeAvatars();
        renderer.dispose();
        container.removeChild(renderer.domElement);
        container.removeChild(labelLayer);
      },
    };
  }

  window.OZGraph3D = { create, THEMES };
})();
