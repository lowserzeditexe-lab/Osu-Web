/**
 * osu! API v2 client with OAuth2 client_credentials flow.
 * Caches the access token in-memory and refreshes it ahead of expiry.
 */
require('dotenv').config();

const OSU_BASE = 'https://osu.ppy.sh';
const TOKEN_BUFFER_MS = 60 * 60 * 1000; // refresh 1h before real expiry

let _token = null;
let _tokenExpiresAt = 0;
let _tokenPromise = null;

async function _fetchToken() {
  const client_id = process.env.OSU_CLIENT_ID;
  const client_secret = process.env.OSU_CLIENT_SECRET;
  if (!client_id || !client_secret) {
    throw new Error('OSU_CLIENT_ID or OSU_CLIENT_SECRET missing in env');
  }
  const res = await fetch(`${OSU_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id,
      client_secret,
      grant_type: 'client_credentials',
      scope: 'public',
    }),
  });
  if (!res.ok) {
    throw new Error(`osu oauth/token failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
  };
}

async function getAccessToken() {
  const now = Date.now();
  if (_token && now < _tokenExpiresAt - TOKEN_BUFFER_MS) return _token;
  if (_tokenPromise) return _tokenPromise;
  _tokenPromise = (async () => {
    try {
      const { access_token, expires_in } = await _fetchToken();
      _token = access_token;
      _tokenExpiresAt = Date.now() + expires_in * 1000;
      return _token;
    } finally {
      _tokenPromise = null;
    }
  })();
  return _tokenPromise;
}

async function osuGet(path, params = {}) {
  const token = await getAccessToken();
  const url = new URL(`${OSU_BASE}/api/v2${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (res.status === 404) {
    const err = new Error('not found');
    err.status = 404;
    throw err;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`osu ${path} failed: ${res.status} ${text}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ------------ Normalisation ------------
function normaliseBeatmapset(bs) {
  if (!bs) return null;
  // Pick the highest difficulty_rating diff for mode=0 (std) if available.
  const diffs = Array.isArray(bs.beatmaps) ? bs.beatmaps : [];
  const stdDiffs = diffs.filter((d) => d.mode === 'osu' || d.mode_int === 0);
  const pool = stdDiffs.length ? stdDiffs : diffs;
  const hardest = pool.reduce(
    (acc, d) => ((d.difficulty_rating || 0) > (acc?.difficulty_rating || 0) ? d : acc),
    null
  );
  const duration = hardest?.total_length ?? diffs[0]?.total_length ?? 0;
  const difficulty = Number(hardest?.difficulty_rating ?? diffs[0]?.difficulty_rating ?? 0);
  const covers = bs.covers || {};
  return {
    id: bs.id,
    title: bs.title,
    artist: bs.artist,
    mapper: bs.creator,
    mapper_id: bs.user_id || null,
    bpm: Math.round(Number(bs.bpm || 0)),
    duration_sec: duration,
    difficulty: Number.isFinite(difficulty) ? difficulty : 0,
    mode: 'std',
    genre: bs.genre?.name || null,
    language: bs.language?.name || null,
    status: bs.status || null,
    source: bs.source || null,
    tags: bs.tags || null,
    cover_url: covers['list@2x'] || covers.list || covers['card@2x'] || covers.card || null,
    cover_card_url: covers['card@2x'] || covers.card || null,
    cover_full_url: covers['cover@2x'] || covers.cover || null,
    audio_url: bs.preview_url ? (bs.preview_url.startsWith('http') ? bs.preview_url : `https:${bs.preview_url}`) : null,
    plays_count: Number(bs.play_count || 0),
    favorites_count: Number(bs.favourite_count || 0),
    created_at: bs.ranked_date || bs.submitted_date || null,
    difficulties: diffs.map((d) => ({
      id: d.id,
      version: d.version,
      difficulty_rating: Number(d.difficulty_rating || 0),
      total_length: d.total_length,
      mode: d.mode,
      bpm: Number(d.bpm || 0),
      cs: d.cs != null ? Number(d.cs) : null,
      ar: d.ar != null ? Number(d.ar) : null,
      // osu! API returns "accuracy" (= OD) and "drain" (= HP)
      od: d.accuracy != null ? Number(d.accuracy) : null,
      hp: d.drain != null ? Number(d.drain) : null,
    })),
  };
}

// ------------ Genre / Language ID mappings for osu! API ------------
const GENRE_IDS = {
  'video game': 2, 'anime': 3, 'rock': 4, 'pop': 5, 'other': 6,
  'novelty': 7, 'hip hop': 9, 'electronic': 10, 'metal': 11,
  'classical': 12, 'folk': 13, 'jazz': 14,
};
const LANGUAGE_IDS = {
  'english': 2, 'japanese': 3, 'chinese': 4, 'instrumental': 5,
  'korean': 6, 'french': 7, 'german': 8, 'swedish': 9,
  'spanish': 10, 'italian': 11, 'russian': 12, 'polish': 13,
};
function getGenreId(g) { return g ? (GENRE_IDS[g.toLowerCase()] || null) : null; }
function getLanguageId(l) { return l ? (LANGUAGE_IDS[l.toLowerCase()] || null) : null; }

// ------------ Response cache (pool prefetch) ------------
// We prefetch large pools for 'popular' and 'new' to serve offset-based pagination
// smoothly on the frontend. Each pool refreshes independently.
const POOL_TTL_MS = 30 * 60 * 1000; // 30 min
const POOL_SIZE = 300; // aim for up to ~6 pages of 50

const pools = new Map(); // key -> { items, loadedAt, loading }

async function loadPool(key, { sort, status = 'ranked', query, genreId, languageId } = {}) {
  const items = [];
  let cursor = undefined;
  const maxPages = (genreId || languageId) ? 4 : 8; // filtered pools are smaller
  const targetSize = (genreId || languageId) ? 100 : POOL_SIZE;
  // osu API returns 50 per page. Walk cursors until we reach target or no more.
  for (let page = 0; page < maxPages && items.length < targetSize; page++) {
    const params = { m: 0, s: status, sort };
    if (query) params.q = query;
    if (cursor) params.cursor_string = cursor;
    if (genreId) params.g = genreId;
    if (languageId) params.l = languageId;
    let data;
    try {
      data = await osuGet('/beatmapsets/search', params);
    } catch (e) {
      if (page === 0) throw e;
      break;
    }
    const batch = (data.beatmapsets || []).map(normaliseBeatmapset).filter(Boolean);
    items.push(...batch);
    cursor = data.cursor_string;
    if (!cursor || batch.length === 0) break;
  }
  return items.slice(0, targetSize);
}

async function getPool(key, loader) {
  const existing = pools.get(key);
  const now = Date.now();
  if (existing && existing.items && now - existing.loadedAt < POOL_TTL_MS) {
    return existing.items;
  }
  if (existing && existing.loading) {
    return existing.loading;
  }
  const loading = loader()
    .then((items) => {
      pools.set(key, { items, loadedAt: Date.now(), loading: null });
      return items;
    })
    .catch((err) => {
      pools.delete(key);
      throw err;
    });
  pools.set(key, { items: existing?.items, loadedAt: existing?.loadedAt || 0, loading });
  return loading;
}

async function getPopularPool(genreId, languageId) {
  const key = `popular:g${genreId || 0}:l${languageId || 0}`;
  return getPool(key, () => loadPool(key, { sort: 'plays_desc', status: 'ranked', genreId, languageId }));
}
async function getNewPool(genreId, languageId) {
  const key = `new:g${genreId || 0}:l${languageId || 0}`;
  return getPool(key, () => loadPool(key, { sort: 'ranked_desc', status: 'ranked', genreId, languageId }));
}

function paginate(items, limit, offset) {
  const total = items.length;
  const page = items.slice(offset, offset + limit);
  return { items: page, total, limit, offset };
}

// ------------ Random ------------
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffleSeeded(items, seed) {
  const rng = mulberry32(seed);
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ------------ Search cursor cache (osu-native) ------------
// Key: stringified filters. Value: { pages: [items...], nextCursor, loadedAt }
const searchCursors = new Map();
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;

const VALID_STATUSES = new Set([
  'any', 'ranked', 'loved', 'qualified', 'pending', 'graveyard', 'wip',
]);
// osu! API sort values: https://osu.ppy.sh/docs/index.html#get-apiv2beatmapsetssearch
const VALID_SORTS = new Set([
  'relevance',
  'title_asc', 'title_desc',
  'artist_asc', 'artist_desc',
  'difficulty_asc', 'difficulty_desc',
  'ranked_asc', 'ranked_desc',
  'updated_asc', 'updated_desc',
  'plays_asc', 'plays_desc',
  'favourites_asc', 'favourites_desc',
  'rating_asc', 'rating_desc',
]);
const VALID_MODES = new Set(['osu', 'taiko', 'fruits', 'mania']);
const MODE_INT = { osu: 0, taiko: 1, fruits: 2, mania: 3 };

function normaliseSearchParams(raw) {
  const q = (raw.q || '').trim();
  const status = VALID_STATUSES.has(raw.status) ? raw.status : 'ranked';
  // Relevance only makes sense when a query is present; otherwise default to ranked_desc.
  let sort = VALID_SORTS.has(raw.sort) ? raw.sort : 'relevance';
  if (sort === 'relevance' && !q) sort = 'ranked_desc';
  const mode = VALID_MODES.has(raw.mode) ? raw.mode : 'osu';
  return {
    q,
    status,
    sort,
    mode,
    modeInt: MODE_INT[mode],
    genre: raw.genre || null,
    language: raw.language || null,
    bpm_min: raw.bpm_min,
    bpm_max: raw.bpm_max,
    diff_min: raw.diff_min,
    diff_max: raw.diff_max,
  };
}

function buildSearchKey(p) {
  return [
    p.q, p.status, p.sort, p.mode,
    p.genre || '', p.language || '',
  ].join('|');
}

function toOsuSortParam(sort) {
  // Relevance is the API default (no `sort` param) when q is present.
  if (sort === 'relevance') return undefined;
  return sort;
}

async function searchNativePage({ params, pageIndex }) {
  const key = buildSearchKey(params);
  let entry = searchCursors.get(key);
  const now = Date.now();
  if (!entry || now - entry.loadedAt > SEARCH_CACHE_TTL_MS) {
    entry = { pages: [], nextCursor: undefined, loadedAt: now };
    searchCursors.set(key, entry);
  }
  while (entry.pages.length <= pageIndex && (entry.pages.length === 0 || entry.nextCursor)) {
    const req = { m: params.modeInt };
    if (params.status && params.status !== 'any') req.s = params.status;
    if (params.status === 'any') req.s = 'any';
    const sortParam = toOsuSortParam(params.sort);
    if (sortParam) req.sort = sortParam;
    if (params.q) req.q = params.q;
    if (params.genre) {
      const gid = getGenreId(params.genre);
      if (gid) req.g = gid;
    }
    if (params.language) {
      const lid = getLanguageId(params.language);
      if (lid) req.l = lid;
    }
    if (entry.nextCursor) req.cursor_string = entry.nextCursor;
    let data;
    try {
      data = await osuGet('/beatmapsets/search', req);
    } catch (e) {
      break;
    }
    const items = (data.beatmapsets || []).map(normaliseBeatmapset).filter(Boolean);
    entry.pages.push(items);
    entry.nextCursor = data.cursor_string || null;
    if (!entry.nextCursor) break;
  }
  return {
    items: entry.pages[pageIndex] || [],
    hasMore: Boolean(entry.nextCursor) || entry.pages.length > pageIndex + 1,
    pagesLoaded: entry.pages.length,
  };
}

async function search(rawParams) {
  const p = normaliseSearchParams(rawParams);
  const limit = Math.min(48, Math.max(1, parseInt(rawParams.limit, 10) || 24));
  const offset = Math.max(0, parseInt(rawParams.offset, 10) || 0);

  // Direct ID lookup pin: if the query is pure digits AND offset===0, try to
  // fetch the matching beatmapset and prepend it. We also continue the normal
  // search in parallel so that other matches show below.
  let idPin = null;
  if (offset === 0 && p.q && /^\d+$/.test(p.q)) {
    try {
      const bs = await osuGet(`/beatmapsets/${parseInt(p.q, 10)}`);
      idPin = normaliseBeatmapset(bs);
    } catch (_) {
      idPin = null;
    }
  }

  // Empty q + no filters → empty list (keep the page quiet)
  const hasAnyCriteria = Boolean(
    p.q || p.genre || p.language ||
    rawParams.bpm_min || rawParams.bpm_max ||
    rawParams.diff_min || rawParams.diff_max ||
    (p.status && p.status !== 'ranked') ||
    (p.sort && p.sort !== 'relevance' && p.sort !== 'ranked_desc')
  );

  if (!hasAnyCriteria && !idPin) {
    return {
      items: [], total: 0, total_known_complete: true,
      limit, offset, has_more: false, q: p.q,
      status: p.status, sort: p.sort, mode: p.mode,
    };
  }

  // Walk osu pages, applying client-side numeric filters (bpm/difficulty) until
  // we have enough matches for the current window or the API is exhausted.
  const MAX_PAGES = 20;
  const needed = offset + limit + 1;
  const filtered = [];
  let pagesLoaded = 0;
  let apiHasMore = true;

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await searchNativePage({ params: p, pageIndex: page });
    if (!res.items.length && !res.hasMore) {
      apiHasMore = false;
      break;
    }
    const batch = applyFilters(res.items, {
      bpm_min: rawParams.bpm_min, bpm_max: rawParams.bpm_max,
      diff_min: rawParams.diff_min, diff_max: rawParams.diff_max,
    });
    // de-dupe against idPin to avoid it appearing twice on page 1
    for (const it of batch) {
      if (idPin && it.id === idPin.id) continue;
      filtered.push(it);
    }
    pagesLoaded = res.pagesLoaded;
    apiHasMore = res.hasMore;
    if (filtered.length >= needed) break;
    if (!apiHasMore) break;
  }

  let slice = filtered.slice(offset, offset + limit);
  if (idPin && offset === 0) {
    slice = [idPin, ...slice.slice(0, Math.max(0, limit - 1))];
  }

  const has_more = filtered.length > offset + limit || apiHasMore;
  const total_known_complete = !apiHasMore;
  const total = filtered.length + (idPin ? 1 : 0);

  return {
    items: slice,
    total,
    total_known_complete,
    limit, offset,
    q: p.q, status: p.status, sort: p.sort, mode: p.mode,
    genre: p.genre, language: p.language,
    has_more,
    pages_loaded: pagesLoaded,
    id_pin: idPin ? idPin.id : null,
  };
}

// ------------ Filter pool ------------
function applyFilters(items, { genre, language, bpm_min, bpm_max, diff_min, diff_max } = {}) {
  return items.filter((b) => {
    if (bpm_min !== null && bpm_min !== undefined && !isNaN(bpm_min) && b.bpm < Number(bpm_min)) return false;
    if (bpm_max !== null && bpm_max !== undefined && !isNaN(bpm_max) && b.bpm > Number(bpm_max)) return false;
    if (diff_min !== null && diff_min !== undefined && !isNaN(diff_min) && b.difficulty < Number(diff_min)) return false;
    if (diff_max !== null && diff_max !== undefined && !isNaN(diff_max) && b.difficulty > Number(diff_max)) return false;
    return true;
  });
}

// ------------ High-level endpoints ------------
async function listNew({ limit = 12, offset = 0, filters = {} } = {}) {
  const genreId = getGenreId(filters.genre);
  const languageId = getLanguageId(filters.language);
  const pool = await getNewPool(genreId, languageId);
  const filtered = applyFilters(pool, filters);
  return paginate(filtered, limit, offset);
}

async function listPopular({ limit = 12, offset = 0, filters = {} } = {}) {
  const genreId = getGenreId(filters.genre);
  const languageId = getLanguageId(filters.language);
  const pool = await getPopularPool(genreId, languageId);
  const filtered = applyFilters(pool, filters);
  return paginate(filtered, limit, offset);
}

async function listRandom({ limit = 12, offset = 0, seed, filters = {} } = {}) {
  const genreId = getGenreId(filters.genre);
  const languageId = getLanguageId(filters.language);
  const pool = await getPopularPool(genreId, languageId);
  const seedStr = (seed || '').toString() || 'default';
  const seedNum = seedFromString(seedStr);
  const shuffled = shuffleSeeded(pool, seedNum);
  const filtered = applyFilters(shuffled, filters);
  return { ...paginate(filtered, limit, offset), seed: seedStr };
}

async function getById(id) {
  const bs = await osuGet(`/beatmapsets/${id}`);
  return normaliseBeatmapset(bs);
}

// ------------ Scores / leaderboard ------------
// Cache: key = `${beatmapId}:${mods}:${mode}`, value = { items, loadedAt }
const SCORES_TTL_MS = 5 * 60 * 1000; // 5 min
const scoresCache = new Map();

function normaliseScore(s) {
  if (!s) return null;
  const user = s.user || {};
  const stats = s.statistics || {};
  // osu! lazer v2 sends both legacy total_score and classic_total_score
  const total = s.total_score ?? s.classic_total_score ?? s.score ?? 0;
  // pp may be null for loved/unranked
  const pp = s.pp != null ? Number(s.pp) : null;
  const acc = s.accuracy != null ? Number(s.accuracy) : null;
  // combo
  const maxCombo = s.max_combo ?? 0;
  // mods: can be array of strings, or array of {acronym,...}
  let mods = [];
  if (Array.isArray(s.mods)) {
    mods = s.mods
      .map((m) => (typeof m === 'string' ? m : m.acronym))
      .filter(Boolean);
  }
  const rank = s.rank || null;
  const date = s.ended_at || s.created_at || null;
  // counts
  const h300 = stats.great ?? stats.count_300 ?? 0;
  const h100 = stats.ok ?? stats.count_100 ?? 0;
  const h50 = stats.meh ?? stats.count_50 ?? 0;
  const miss = stats.miss ?? stats.count_miss ?? 0;
  // Prefer `best_id` (legacy score permalink), fallback to `id`.
  const scoreId = s.best_id ?? s.id ?? null;
  return {
    id: scoreId,
    best_id: s.best_id ?? null,
    legacy_score_id: s.legacy_score_id ?? null,
    rank,
    pp,
    accuracy: acc,
    total_score: Number(total),
    max_combo: Number(maxCombo),
    mods,
    date,
    mode: s.mode || s.ruleset_id != null ? (['osu','taiko','fruits','mania'][s.ruleset_id] || 'osu') : 'osu',
    counts: { h300, h100, h50, miss },
    user: {
      id: user.id,
      username: user.username,
      country_code: user.country_code || user.country?.code || null,
      avatar_url: user.avatar_url || null,
    },
  };
}

async function getScores(beatmapId, { mode = 'osu', type = 'global', legacyOnly = true, limit = 50 } = {}) {
  const key = `${beatmapId}:${mode}:${type}:${legacyOnly ? 'legacy' : 'lazer'}`;
  const now = Date.now();
  const cached = scoresCache.get(key);
  if (cached && now - cached.loadedAt < SCORES_TTL_MS) {
    return cached.items.slice(0, limit);
  }
  const params = { mode, type };
  // osu.ppy.sh's beatmap leaderboard shows legacy-only scores sorted by total
  // score (the "classic" view). We match that default so our leaderboard is 1:1
  // with what a visitor sees on /beatmapsets/{id}#{mode}/{diff}.
  if (legacyOnly) params.legacy_only = 1;
  const data = await osuGet(`/beatmaps/${beatmapId}/scores`, params);
  const list = Array.isArray(data.scores) ? data.scores : [];
  const items = list.map(normaliseScore).filter(Boolean);
  scoresCache.set(key, { items, loadedAt: now });
  return items.slice(0, limit);
}

module.exports = {
  getAccessToken,
  osuGet,
  normaliseBeatmapset,
  listNew,
  listPopular,
  listRandom,
  search,
  getById,
  getScores,
  applyFilters,
};
