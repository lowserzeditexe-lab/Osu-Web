// Local scoring system.
//
// Every play finished by the user (whether passed or failed) is POSTed
// here from inside webosu2/play.html. We persist the score in MongoDB
// and expose:
//   - GET /api/scores/me/stats         → aggregate stats for ProfileCard
//   - GET /api/scores/beatmap/:id      → osu!Web (local) leaderboard for
//                                         a specific diff
//   - GET /api/scores/me/recent        → user's latest plays (for future
//                                         "recent plays" panel)
//
// We DO NOT distinguish ranked vs unranked yet — every play counts. The
// user explicitly asked for "Pour l'instant il est équivalent à Local
// Ranking" so this is fine for now.
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../services/mongo');
const { getClientId } = require('./users');

const router = express.Router();

// ── osu! level formula (osu!stable) ─────────────────────────────
// Score required to *complete* level N. Inverted to compute (level,
// progress) from a cumulative score. Reference:
//   https://osu.ppy.sh/wiki/en/Gameplay/Score/Total_score#level
function scoreForLevel(n) {
  // levels 1..100  → polynomial
  // levels 101+    → exponential
  if (n <= 100) {
    // 5_000 / 3 * (4 n^3 - 3 n^2 - n) + 1.25 * 1.8^(n-60) for n>=60
    let s = (5000 / 3) * (4 * n ** 3 - 3 * n ** 2 - n);
    if (n >= 60) s += 1.25 * Math.pow(1.8, n - 60);
    return s;
  }
  return 26931190827 + 99999999999 * (n - 100);
}
function levelFromScore(total) {
  if (!total || total <= 0) return { level: 1, progress: 0 };
  let lvl = 1;
  // Bound the loop — well above osu!'s practical levels.
  while (lvl < 200 && scoreForLevel(lvl + 1) <= total) lvl++;
  const cur = scoreForLevel(lvl);
  const next = scoreForLevel(lvl + 1);
  const progress = (total - cur) / Math.max(1, next - cur);
  return { level: lvl, progress: Math.min(1, Math.max(0, progress)) };
}

// ── PP weighting (osu!stable) ───────────────────────────────────
// total_pp = sum_{i=0..N-1}(top_pp[i] * 0.95^i) + bonus(playcount)
function weightedPp(sortedPps, playcount) {
  let total = 0;
  for (let i = 0; i < sortedPps.length; ++i) {
    total += (sortedPps[i] || 0) * Math.pow(0.95, i);
  }
  const bonus = 416.6667 * (1 - Math.pow(0.9994, Math.max(0, playcount)));
  return total + bonus;
}

// ── Validation helpers ──────────────────────────────────────────
const RANK_VALUES = new Set(['XH', 'X', 'SH', 'S', 'A', 'B', 'C', 'D', 'F']);

function clampNum(v, min, max, dflt = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

router.post('/', express.json({ limit: '32kb' }), async (req, res) => {
  const cid = getClientId(req);
  if (!cid) return res.status(400).json({ error: 'X-Client-Id header required' });

  const body = req.body || {};
  const sid = body.sid != null ? String(body.sid) : null;
  const bid = body.bid != null ? String(body.bid) : null;
  if (!bid) return res.status(400).json({ error: 'bid (diff id) required' });

  const mode = ['osu', 'taiko', 'fruits', 'mania'].includes(body.mode) ? body.mode : 'osu';
  const total_score = clampNum(body.total_score, 0, 100_000_000, 0) | 0;
  const accuracy = clampNum(body.accuracy, 0, 1, 0); // 0..1
  const max_combo = clampNum(body.max_combo, 0, 1_000_000, 0) | 0;
  const pp = clampNum(body.pp, 0, 5000, 0);
  const passed = Boolean(body.passed);
  const fc = Boolean(body.full_combo);
  const rank = RANK_VALUES.has(String(body.rank)) ? body.rank : (passed ? 'D' : 'F');

  const hits = body.hits || {};
  const judge = {
    great:  clampNum(hits.great,  0, 100000, 0) | 0,
    good:   clampNum(hits.good,   0, 100000, 0) | 0,
    meh:    clampNum(hits.meh,    0, 100000, 0) | 0,
    miss:   clampNum(hits.miss,   0, 100000, 0) | 0,
    geki:   clampNum(hits.geki,   0, 100000, 0) | 0,
    katu:   clampNum(hits.katu,   0, 100000, 0) | 0,
  };
  const mods = Array.isArray(body.mods)
    ? body.mods.filter((m) => typeof m === 'string').slice(0, 16)
    : (typeof body.mods === 'string' ? body.mods.split('+').filter(Boolean).slice(0, 16) : []);

  const doc = {
    id: uuidv4(),
    user_id: cid,
    sid,
    bid,
    is_local: Boolean(body.is_local),
    mode,
    total_score,
    accuracy,
    max_combo,
    pp,
    rank,
    passed,
    full_combo: fc,
    hits: judge,
    mods,
    title: typeof body.title === 'string' ? body.title.slice(0, 200) : null,
    artist: typeof body.artist === 'string' ? body.artist.slice(0, 200) : null,
    version: typeof body.version === 'string' ? body.version.slice(0, 200) : null,
    star_rating: clampNum(body.star_rating, 0, 20, 0) || null,
    completed_at: new Date(),
  };

  try {
    const db = await getDb();
    await db.collection('scores').insertOne(doc);
    const { _id, ...safe } = doc;
    res.status(201).json(safe);
  } catch (err) {
    console.error('[scores POST]', err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/me/stats', async (req, res) => {
  const cid = getClientId(req);
  if (!cid) return res.status(400).json({ error: 'X-Client-Id header required' });
  try {
    const db = await getDb();
    const all = await db
      .collection('scores')
      .find({ user_id: cid }, {
        projection: { _id: 0, total_score: 1, accuracy: 1, pp: 1, bid: 1, passed: 1 },
      })
      .toArray();

    const playcount = all.length;
    if (playcount === 0) {
      // Stats reset: a brand-new player starts at level 1, 0 pp, 0 acc.
      return res.json({
        playcount: 0,
        passed_count: 0,
        total_score: 0,
        ranked_score: 0,
        accuracy_avg: 0,
        level: 1,
        level_progress: 0,
        pp: 0,
        global_rank: null,
      });
    }

    let total_score = 0;
    let acc_sum = 0;
    let passed_count = 0;
    const bestPpPerBid = new Map();
    for (const s of all) {
      total_score += s.total_score | 0;
      acc_sum += Number(s.accuracy) || 0;
      if (s.passed) passed_count++;
      // Only "passed" plays contribute to weighted pp (osu!stable rule).
      if (s.passed) {
        const cur = bestPpPerBid.get(s.bid) || 0;
        if ((s.pp || 0) > cur) bestPpPerBid.set(s.bid, s.pp || 0);
      }
    }
    const accuracy_avg = acc_sum / playcount;
    const sortedPps = [...bestPpPerBid.values()].sort((a, b) => b - a);
    const totalPp = weightedPp(sortedPps, passed_count);
    const { level, progress } = levelFromScore(total_score);

    // Compute global_rank by counting users with strictly more weighted pp.
    // Cheap: aggregate scores collection grouped by user, weight, sort.
    let globalRank = null;
    try {
      const grouped = await db
        .collection('scores')
        .aggregate([
          { $match: { passed: true } },
          { $group: { _id: { user: '$user_id', bid: '$bid' }, best_pp: { $max: '$pp' }, plays: { $sum: 1 } } },
          { $group: {
              _id: '$_id.user',
              pps: { $push: '$best_pp' },
              passed_plays: { $sum: '$plays' },
            } },
        ])
        .toArray();
      const ranked = grouped.map((g) => {
        const sorted = (g.pps || []).sort((a, b) => b - a);
        return { user: g._id, pp: weightedPp(sorted, g.passed_plays || 0) };
      });
      ranked.sort((a, b) => b.pp - a.pp);
      const idx = ranked.findIndex((r) => r.user === cid);
      globalRank = idx >= 0 ? idx + 1 : null;
    } catch (_) { globalRank = null; }

    res.json({
      playcount,
      passed_count,
      total_score,
      ranked_score: total_score, // simplified: all scores count for now
      accuracy_avg,
      level,
      level_progress: progress,
      pp: Math.round(totalPp),
      global_rank: globalRank,
    });
  } catch (err) {
    console.error('[scores stats]', err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/me/recent', async (req, res) => {
  const cid = getClientId(req);
  if (!cid) return res.status(400).json({ error: 'X-Client-Id header required' });
  try {
    const db = await getDb();
    const items = await db
      .collection('scores')
      .find({ user_id: cid })
      .sort({ completed_at: -1 })
      .limit(20)
      .project({ _id: 0 })
      .toArray();
    res.json({ items });
  } catch (err) {
    console.error('[scores recent]', err);
    res.status(500).json({ error: 'internal error' });
  }
});

// Local osu!Web leaderboard for a given diff (bid). Returns the top
// passed score per user, sorted by total_score desc. Joined with the
// users collection so each row carries username + country.
router.get('/beatmap/:bid', async (req, res) => {
  const bid = String(req.params.bid || '').trim();
  if (!bid) return res.status(400).json({ error: 'bid required' });
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 50));
  try {
    const db = await getDb();
    const items = await db
      .collection('scores')
      .aggregate([
        { $match: { bid, passed: true } },
        { $sort: { total_score: -1, completed_at: 1 } },
        { $group: {
            _id: '$user_id',
            best: { $first: '$$ROOT' },
          } },
        { $replaceRoot: { newRoot: '$best' } },
        { $sort: { total_score: -1, completed_at: 1 } },
        { $limit: limit },
        { $lookup: { from: 'users', localField: 'user_id', foreignField: 'id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $project: {
            _id: 0,
            id: '$id',
            total_score: 1,
            accuracy: 1,
            max_combo: 1,
            pp: 1,
            rank: 1,
            mods: 1,
            full_combo: 1,
            hits: 1,
            completed_at: 1,
            user: {
              id: '$user.id',
              username: '$user.username',
              country_code: '$user.country',
              avatar_url: null,
            },
          } },
      ])
      .toArray();
    res.json({ items });
  } catch (err) {
    console.error('[scores leaderboard]', err);
    res.status(500).json({ error: 'internal error' });
  }
});

module.exports = router;
