const express = require('express');
const osu = require('../services/osu');

const router = express.Router();

function parseLimitOffset(req, defLimit = 12, maxLimit = 48) {
  const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit || defLimit, 10) || defLimit));
  const offset = Math.max(0, parseInt(req.query.offset || 0, 10) || 0);
  return { limit, offset };
}

function parseFilters(req) {
  return {
    genre: req.query.genre || null,
    language: req.query.language || null,
    bpm_min: req.query.bpm_min !== undefined && req.query.bpm_min !== '' ? Number(req.query.bpm_min) : null,
    bpm_max: req.query.bpm_max !== undefined && req.query.bpm_max !== '' ? Number(req.query.bpm_max) : null,
    diff_min: req.query.diff_min !== undefined && req.query.diff_min !== '' ? Number(req.query.diff_min) : null,
    diff_max: req.query.diff_max !== undefined && req.query.diff_max !== '' ? Number(req.query.diff_max) : null,
  };
}

router.get('/new', async (req, res) => {
  try {
    const { limit, offset } = parseLimitOffset(req);
    const filters = parseFilters(req);
    const data = await osu.listNew({ limit, offset, filters });
    res.json(data);
  } catch (e) {
    console.error('[beatmaps.new]', e.message);
    res.status(502).json({ error: 'osu! API unavailable', detail: e.message });
  }
});

router.get('/popular', async (req, res) => {
  try {
    const { limit, offset } = parseLimitOffset(req);
    const filters = parseFilters(req);
    const data = await osu.listPopular({ limit, offset, filters });
    res.json(data);
  } catch (e) {
    console.error('[beatmaps.popular]', e.message);
    res.status(502).json({ error: 'osu! API unavailable', detail: e.message });
  }
});

router.get('/random', async (req, res) => {
  try {
    const { limit, offset } = parseLimitOffset(req, 6);
    const seed = (req.query.seed || '').toString();
    const filters = parseFilters(req);
    const data = await osu.listRandom({ limit, offset, seed, filters });
    res.json(data);
  } catch (e) {
    console.error('[beatmaps.random]', e.message);
    res.status(502).json({ error: 'osu! API unavailable', detail: e.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const { limit, offset } = parseLimitOffset(req, 24);
    const q = (req.query.q || '').toString();
    const data = await osu.search({
      q,
      status: (req.query.status || '').toString() || undefined,
      sort: (req.query.sort || '').toString() || undefined,
      mode: (req.query.mode || '').toString() || undefined,
      genre: req.query.genre || null,
      language: req.query.language || null,
      bpm_min: req.query.bpm_min,
      bpm_max: req.query.bpm_max,
      diff_min: req.query.diff_min,
      diff_max: req.query.diff_max,
      limit,
      offset,
    });
    res.json(data);
  } catch (e) {
    console.error('[beatmaps.search]', e.message);
    res.status(502).json({ error: 'osu! API unavailable', detail: e.message });
  }
});

router.get('/:id(\\d+)', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const bm = await osu.getById(id);
    if (!bm) return res.status(404).json({ error: 'not found' });
    res.json(bm);
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: 'not found' });
    console.error('[beatmaps.:id]', e.message);
    res.status(502).json({ error: 'osu! API unavailable', detail: e.message });
  }
});

// Leaderboard for a specific difficulty (beatmap id, NOT beatmapset id).
router.get('/diff/:id(\\d+)/scores', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const mode = (req.query.mode || 'osu').toString();
    const type = (req.query.type || 'global').toString();
    // Default to legacy-only scores to mirror what osu.ppy.sh displays.
    // `variant=lazer` forces lazer (solo) scores sorted by pp.
    const variant = (req.query.variant || 'legacy').toString();
    const legacyOnly = variant !== 'lazer';
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '50', 10) || 50));
    const items = await osu.getScores(id, { mode, type, legacyOnly, limit });
    res.json({ items, total: items.length, beatmap_id: id, mode, type, variant: legacyOnly ? 'legacy' : 'lazer' });
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: 'not found', items: [] });
    if (e.status === 401 || e.status === 403) {
      return res.status(200).json({ items: [], total: 0, restricted: true, detail: e.message });
    }
    console.error('[beatmaps.diff.scores]', e.message);
    res.status(502).json({ error: 'osu! API unavailable', detail: e.message, items: [] });
  }
});

module.exports = router;
