// Real-data loader — converts X/Twitter followers/follows export JSON into
// the graph shape our viz consumes.
//
// Input: array of records like:
//   { id, jobId, type:'followers'|'following'|'follows', restId, screenName,
//     name, followersCount, friendsCount, statusesCount, avatarUrl,
//     description, verified, location, capturedFromScreenName, capturedAt }
//
// Output: same shape as OZData.generateGraph returns.
//
// "type" on each row tells us the record's relation to capturedFromScreenName:
//   followers → this user follows capturedFromScreenName
//   following/follows → capturedFromScreenName follows this user
//
// Depth 1 = records where capturedFromScreenName == rootScreenName
// Depth 2 = records where capturedFromScreenName is a depth-1 handle

(function () {
  function colorFromString(s) {
    let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    const hue = Math.abs(h) % 360;
    const hue2 = (hue + 40) % 360;
    return { c1: `hsl(${hue},60%,55%)`, c2: `hsl(${hue2},55%,40%)`, initials: s.slice(0, 2).toUpperCase() };
  }

  function convert(records, opts = {}) {
    const rootHandle = opts.rootHandle || guessRoot(records);
    const useAvatars = opts.useAvatars !== false;

    const byHandle = new Map(); // screenName -> node
    const nodes = [];
    const edges = [];
    const mutuals = new Set();
    const followsOfMe = new Set(); // IDs (node ids, not restId)
    const followersOfMe = new Set();

    function ensureNode(rec, depth) {
      const id = rec.screenName;
      if (byHandle.has(id)) {
        const existing = byHandle.get(id);
        // keep shallowest depth
        if (depth < existing.depth) existing.depth = depth;
        // 後から avatarUrl / followers / friends / statuses / name が来たら埋める
        // (capturedFromScreenName 側として先に空オブジェクトで作成されたノードは
        //  後で rec の screenName 側として再 ensure された時に初めて値が入る)
        if (!existing.avatarUrl && rec.avatarUrl) existing.avatarUrl = rec.avatarUrl;
        if (!existing.followers && rec.followersCount) existing.followers = rec.followersCount;
        if (!existing.follows && rec.friendsCount) existing.follows = rec.friendsCount;
        if (!existing.statuses && rec.statusesCount) existing.statuses = rec.statusesCount;
        if ((!existing.name || existing.name === id) && rec.name) existing.name = rec.name;
        return existing;
      }
      const n = {
        id,
        restId: rec.restId,
        handle: rec.screenName,
        name: rec.name || rec.screenName,
        bio: rec.description || '',
        avatarUrl: useAvatars ? rec.avatarUrl : null,
        avatar: colorFromString(rec.screenName),
        followers: rec.followersCount ?? 0,
        follows: rec.friendsCount ?? 0,
        statuses: rec.statusesCount ?? 0,
        verified: !!rec.verified,
        location: rec.location || '',
        tags: [],
        joinedAt: rec.capturedAt ? rec.capturedAt - 365 * 86400000 : Date.now() - 365 * 86400000,
        depth,
      };
      byHandle.set(id, n);
      nodes.push(n);
      return n;
    }

    // Seed self
    const self = {
      id: rootHandle,
      handle: rootHandle,
      name: rootHandle,
      bio: 'このグラフの中心',
      avatar: { c1: '#0a0a0c', c2: '#f5f1e8', initials: (rootHandle || 'ME').slice(0, 2).toUpperCase() },
      followers: 0, follows: 0, statuses: 0,
      tags: ['root'], joinedAt: Date.now() - 365 * 86400000,
      depth: 0, isSelf: true,
    };
    nodes.push(self); byHandle.set(rootHandle, self);

    // Build edges from records
    const edgeKey = (a, b) => a < b ? `${a}\u0001${b}` : `${b}\u0001${a}`;
    const edgeMap = new Map(); // key -> {from,to,kind,mutual,since}

    for (const rec of records) {
      const rel = rec.type;
      const captured = rec.capturedFromScreenName;
      const other = rec.screenName;
      if (!captured || !other || captured === other) continue;

      const capturedDepth = captured === rootHandle ? 0 : 1;
      const otherDepth = capturedDepth + 1;
      ensureNode({ screenName: captured, name: captured, restId: '', description: '', followersCount: 0, friendsCount: 0, statusesCount: 0 }, capturedDepth);
      ensureNode(rec, otherDepth);

      // Direction:
      //   'followers' → other follows captured
      //   'following'/'follows' → captured follows other
      let from, to;
      if (rel === 'followers') { from = other; to = captured; }
      else { from = captured; to = other; }

      const key = edgeKey(from, to);
      if (edgeMap.has(key)) {
        const existing = edgeMap.get(key);
        // if we previously saw reverse direction → mutual
        if (existing.from !== from) {
          existing.mutual = true;
          existing.kind = 'mutual';
        }
      } else {
        edgeMap.set(key, {
          from, to,
          mutual: false,
          since: rec.capturedAt || Date.now(),
          kind: from === rootHandle ? 'follow' : (to === rootHandle ? 'follower' : 'other'),
        });
      }
    }

    for (const e of edgeMap.values()) {
      edges.push(e);
      if (e.mutual) {
        if (e.from === rootHandle) mutuals.add(e.to);
        else if (e.to === rootHandle) mutuals.add(e.from);
      }
      if (e.kind === 'follow' && !e.mutual) followsOfMe.add(e.to);
      if (e.kind === 'follower' && !e.mutual) followersOfMe.add(e.from);
      if (e.mutual) { followsOfMe.add(e.from === rootHandle ? e.to : e.from); followersOfMe.add(e.from === rootHandle ? e.to : e.from); }
    }

    // Activity log — sort nodes by capturedAt, fabricate follow entries
    const log = [];
    const dated = [...byHandle.values()].filter(n => !n.isSelf).slice(0, 60);
    dated.forEach(n => {
      log.push({ ts: n.joinedAt + 365 * 86400000, kind: 'followed', userId: n.id, userName: n.name, userHandle: n.handle });
    });
    log.sort((a, b) => b.ts - a.ts);

    return {
      nodes, edges,
      byId: byHandle,
      followsOfMe: [...followsOfMe],
      followersOfMe: [...followersOfMe],
      mutuals,
      log,
      stats: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        d1: nodes.filter(n => n.depth === 1).length,
        d2: nodes.filter(n => n.depth === 2).length,
        mutualsCount: mutuals.size,
      },
    };
  }

  function guessRoot(records) {
    const counts = {};
    for (const r of records) {
      if (r.capturedFromScreenName) counts[r.capturedFromScreenName] = (counts[r.capturedFromScreenName] || 0) + 1;
    }
    let best = null, bestN = -1;
    for (const [k, v] of Object.entries(counts)) if (v > bestN) { best = k; bestN = v; }
    return best || 'me';
  }

  window.OZLoader = { convert, guessRoot };
})();
