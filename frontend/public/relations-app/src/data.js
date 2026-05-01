// Mock data generator — fake follow/follower graph with depth=2
// Generates realistic-looking Japanese and English usernames.
// Self node + ~N follows + ~N followers at depth 1, plus a sampled depth-2 layer.

(function () {
  const FAMILY_NAMES_JP = ['田中','佐藤','鈴木','高橋','伊藤','渡辺','山本','中村','小林','加藤','吉田','山田','佐々木','山口','松本','井上','木村','林','斎藤','清水','山崎','森','阿部','池田','橋本','石川','前田','藤田','後藤','岡田','長谷川','石井','村上','近藤','坂本','遠藤','青木','藤井','西村','福田','太田','三浦','藤原','岡本','松田','中島','中野','原田','小川','竹内'];
  const GIVEN_NAMES_JP = ['翔','陸','大和','悠真','蓮','樹','湊','陽翔','楓','葵','結衣','陽菜','凛','咲良','心春','杏','美羽','莉子','芽依','紬','海斗','春翔','琉生','颯太','碧','瑛太','朝陽','桃花','美桜','千尋'];
  const HANDLE_BASES = ['koji','yuki','ren','miku','soma','kaede','haruto','sora','nao','rin','mio','aoi','riku','sota','hina','yui','ayu','kei','sho','taku','ryo','saya','mei','emi','jun','ken','mai','tomo','yuta','ami','kyo','ryu','ray','luna','zen','mao','neo','ao'];
  const HANDLE_SUFFIX = ['','_jp','.dev','_','_studio','x','01','77','_art','_ux','_ai','7','02','_hq','_tokyo','99','_lab','_io','_',''];
  const BIO_FRAGMENTS = [
    'デザインと技術の境界を探る',
    'UI/UX designer · Tokyo',
    '写真と旅、コーヒー',
    'フロントエンド / デザインシステム',
    '3DとWebGLが好き',
    'プロダクトマネージャー',
    '猫派・映画・本',
    'イラストレーター / アニメーション',
    'Open source enthusiast',
    '生成AIとクリエイティブ',
    'music · film · tokyo',
    'アート・建築・空間デザイン',
    'ただのコーヒー好き',
    'バックエンド・分散システム',
    '日常をデザインする',
    'human + machine',
    '静かに考え、速く作る',
    'type, motion, interaction',
    'よろしくお願いします',
    'startup founder / builder',
  ];
  const TAGS = ['design','engineer','art','photo','cat','music','travel','ai','web','3d','code','book','coffee','game','anime','architecture','film','maker','research','founder'];

  // Deterministic RNG (mulberry32) so the graph is stable across reloads
  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function pickN(rng, arr, n) {
    const out = []; const used = new Set();
    while (out.length < n && used.size < arr.length) {
      const i = Math.floor(rng() * arr.length);
      if (used.has(i)) continue;
      used.add(i); out.push(arr[i]);
    }
    return out;
  }

  function makeHandle(rng) {
    return pick(rng, HANDLE_BASES) + pick(rng, HANDLE_SUFFIX) + (rng() < 0.3 ? String(Math.floor(rng() * 999)) : '');
  }

  function makeName(rng) {
    return pick(rng, FAMILY_NAMES_JP) + ' ' + pick(rng, GIVEN_NAMES_JP);
  }

  // Avatar: generate a deterministic gradient swatch (SVG data URL).
  // Keeps things lightweight — no network fetches for 10k+ avatars.
  function makeAvatar(id, rng) {
    const hues = [
      [10, 45], [190, 220], [85, 110], [280, 310], [340, 360], [55, 75], [240, 270],
    ];
    const [h1, h2] = pick(rng, hues);
    const l1 = 55 + Math.floor(rng() * 20);
    const l2 = 35 + Math.floor(rng() * 20);
    const c1 = `hsl(${h1},60%,${l1}%)`;
    const c2 = `hsl(${h2},55%,${l2}%)`;
    const initials = id.slice(0, 2).toUpperCase();
    return { c1, c2, initials };
  }

  function generateGraph({
    seed = 42,
    depth1Count = 220, // 実際には5000推奨だが、デモではLOD見せるため220
    depth2PerNode = 6,
    scale = 'demo', // 'demo' or 'full'
  } = {}) {
    // scale=full → 5000フォロー+5000フォロワー、各500に深さ2を10件ずつくらい
    // scale=demo → 軽量デモ用
    if (scale === 'full') {
      depth1Count = 450;
      depth2PerNode = 8;
    }

    const rng = mulberry32(seed);
    const nodes = [];
    const edges = [];
    const byId = new Map();

    const now = Date.now();
    const daysAgo = (d) => now - d * 86400000;

    // Self (root)
    const self = {
      id: 'me',
      handle: 'me',
      name: 'あなた',
      bio: 'このグラフの中心',
      avatar: { c1: '#0a0a0c', c2: '#f5f1e8', initials: 'ME' },
      followers: 9999,
      follows: 9999,
      tags: ['me'],
      joinedAt: daysAgo(800),
      depth: 0,
      isSelf: true,
    };
    nodes.push(self); byId.set('me', self);

    // Depth 1 — follows & followers of self
    const followsOfMe = [];
    const followersOfMe = [];
    const mutuals = new Set();

    const depth1Seeds = [];
    for (let i = 0; i < depth1Count * 2; i++) {
      const id = 'u' + i;
      const handle = makeHandle(rng) + (rng() < 0.1 ? '_' + i : '');
      const tagsN = 1 + Math.floor(rng() * 3);
      const n = {
        id, handle, name: makeName(rng),
        bio: pick(rng, BIO_FRAGMENTS),
        avatar: makeAvatar(id, rng),
        followers: Math.floor(Math.pow(rng(), 2.5) * 50000) + 10,
        follows: Math.floor(Math.pow(rng(), 2.2) * 5000) + 5,
        tags: pickN(rng, TAGS, tagsN),
        joinedAt: daysAgo(Math.floor(rng() * 1500)),
        depth: 1,
      };
      nodes.push(n); byId.set(id, n);
      depth1Seeds.push(n);
    }

    // Assign roles: some are follows, some followers, some mutuals
    for (const n of depth1Seeds) {
      const r = rng();
      if (r < 0.35) {
        // mutual
        edges.push({ from: 'me', to: n.id, mutual: true, since: daysAgo(Math.floor(rng() * 1200)), kind: 'mutual' });
        mutuals.add(n.id);
        followsOfMe.push(n.id);
        followersOfMe.push(n.id);
      } else if (r < 0.70) {
        edges.push({ from: 'me', to: n.id, mutual: false, since: daysAgo(Math.floor(rng() * 1200)), kind: 'follow' });
        followsOfMe.push(n.id);
      } else {
        edges.push({ from: n.id, to: 'me', mutual: false, since: daysAgo(Math.floor(rng() * 1200)), kind: 'follower' });
        followersOfMe.push(n.id);
      }
    }

    // Depth 2 — sample each d1 node's follows/followers
    // Reuse same pool + add some new ones
    const d2Pool = [];
    for (let i = 0; i < depth1Count * depth2PerNode * 0.4; i++) {
      const id = 'v' + i;
      const n = {
        id, handle: makeHandle(rng),
        name: makeName(rng),
        bio: pick(rng, BIO_FRAGMENTS),
        avatar: makeAvatar(id, rng),
        followers: Math.floor(Math.pow(rng(), 2.5) * 20000) + 5,
        follows: Math.floor(Math.pow(rng(), 2.2) * 3000) + 5,
        tags: pickN(rng, TAGS, 1 + Math.floor(rng() * 2)),
        joinedAt: daysAgo(Math.floor(rng() * 1500)),
        depth: 2,
      };
      nodes.push(n); byId.set(id, n);
      d2Pool.push(n);
    }

    for (const d1 of depth1Seeds) {
      const nn = Math.floor(depth2PerNode * (0.3 + rng()));
      for (let i = 0; i < nn; i++) {
        // 70% from d2Pool, 30% from other d1 (creates cross-links!)
        let other;
        if (rng() < 0.7 && d2Pool.length) {
          other = d2Pool[Math.floor(rng() * d2Pool.length)];
        } else {
          other = depth1Seeds[Math.floor(rng() * depth1Seeds.length)];
          if (other.id === d1.id) continue;
        }
        const kind = rng() < 0.3 ? 'mutual' : (rng() < 0.5 ? 'follow' : 'follower');
        edges.push({
          from: kind === 'follower' ? other.id : d1.id,
          to: kind === 'follower' ? d1.id : other.id,
          mutual: kind === 'mutual',
          since: daysAgo(Math.floor(rng() * 1000)),
          kind,
        });
      }
    }

    // Activity log (most recent at top)
    const log = [];
    for (let i = 0; i < 40; i++) {
      const n = depth1Seeds[Math.floor(rng() * depth1Seeds.length)];
      log.push({
        ts: daysAgo(Math.floor(rng() * 30)),
        kind: rng() < 0.75 ? 'followed' : 'unfollowed',
        userId: n.id,
        userName: n.name,
        userHandle: n.handle,
      });
    }
    log.sort((a, b) => b.ts - a.ts);

    return { nodes, edges, byId, followsOfMe, followersOfMe, mutuals, log, stats: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      d1: depth1Seeds.length,
      d2: d2Pool.length,
      mutualsCount: mutuals.size,
    }};
  }

  window.OZData = { generateGraph };
})();
