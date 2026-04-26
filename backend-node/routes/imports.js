// Beatmap-import routes.
//
// Users drop a .osz file from their disk → we unzip it server-side, parse
// every .osu inside (one .osu == one difficulty), persist the metadata in
// MongoDB and the raw .osz blob in GridFS. The play.html engine later
// downloads the .osz back from `/api/imports/:id/file` instead of from
// the public NeriNyan CDN.
//
// Routes (all require X-Client-Id header except `/file` and `/cover`
// which are reached by the play iframe / <img> and have unguessable UUID
// IDs — the trade-off is OK for an MVP without real auth):
//   POST   /api/imports               (multipart/form-data 'osz')
//   GET    /api/imports               list current user's imports
//   GET    /api/imports/:id           single import metadata
//   GET    /api/imports/:id/file      stream the .osz from GridFS
//   GET    /api/imports/:id/cover     stream the extracted cover image
//   DELETE /api/imports/:id           delete the import + GridFS files
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { getDb, getOszBucket, getCoverBucket } = require('../services/mongo');
const { parseOszBuffer } = require('../services/oszParser');
const { getClientId } = require('./users');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  // Hard cap at 200 MB. Big mapsets with FX/SB can easily reach 100+ MB.
  limits: { fileSize: 200 * 1024 * 1024 },
});

function sanitizeImport(doc) {
  if (!doc) return doc;
  const { _id, osz_file_id, cover_file_id, ...rest } = doc;
  // Backfill aliases for older docs that pre-date these fields. Avoids a
  // DB migration while keeping the wire shape uniform for the frontend.
  if (rest.duration_sec == null && rest.length_seconds != null) {
    rest.duration_sec = rest.length_seconds;
  }
  if (rest.mapper == null && rest.creator != null) {
    rest.mapper = rest.creator;
  }
  if (rest.osu_set_id === undefined) {
    rest.osu_set_id =
      (Array.isArray(rest.difficulties)
        ? rest.difficulties.find((d) => d && d.beatmap_set_id)?.beatmap_set_id
        : null) || null;
  }
  if (typeof rest.tags === 'string') {
    rest.tags = rest.tags.split(/\s+/).filter(Boolean);
  }
  return rest;
}

router.get('/', async (req, res) => {
  const cid = getClientId(req);
  if (!cid) return res.status(400).json({ error: 'X-Client-Id header required' });
  try {
    const db = await getDb();
    const items = await db
      .collection('imports')
      .find({ owner_id: cid })
      .sort({ created_at: -1 })
      .toArray();
    res.json({ items: items.map(sanitizeImport) });
  } catch (err) {
    console.error('[imports list]', err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/:id', async (req, res) => {
  const cid = getClientId(req);
  if (!cid) return res.status(400).json({ error: 'X-Client-Id header required' });
  try {
    const db = await getDb();
    const item = await db.collection('imports').findOne({ id: req.params.id, owner_id: cid });
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json(sanitizeImport(item));
  } catch (err) {
    console.error('[imports get]', err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/:id/file', async (req, res) => {
  // Reached by the iframe — no header propagation. We rely on the UUID
  // being unguessable. A real auth pass will come later.
  try {
    const db = await getDb();
    const item = await db.collection('imports').findOne({ id: req.params.id });
    if (!item) return res.status(404).end();
    const bucket = await getOszBucket();
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${(item.original_filename || 'beatmap').replace(/"/g, '')}"`
    );
    if (item.osz_size_bytes) res.setHeader('Content-Length', String(item.osz_size_bytes));
    bucket
      .openDownloadStream(item.osz_file_id)
      .on('error', () => { try { res.end(); } catch (_) {} })
      .pipe(res);
  } catch (err) {
    console.error('[imports file]', err);
    if (!res.headersSent) res.status(500).end();
  }
});

router.get('/:id/cover', async (req, res) => {
  try {
    const db = await getDb();
    const item = await db.collection('imports').findOne({ id: req.params.id });
    if (!item || !item.cover_file_id) return res.status(404).end();
    const bucket = await getCoverBucket();
    res.setHeader('Content-Type', item.cover_content_type || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    bucket
      .openDownloadStream(item.cover_file_id)
      .on('error', () => { try { res.end(); } catch (_) {} })
      .pipe(res);
  } catch (err) {
    console.error('[imports cover]', err);
    if (!res.headersSent) res.status(500).end();
  }
});

router.post('/', upload.single('osz'), async (req, res) => {
  const cid = getClientId(req);
  if (!cid) return res.status(400).json({ error: 'X-Client-Id header required' });
  if (!req.file) return res.status(400).json({ error: 'osz file required (field name: osz)' });

  let parsed;
  try {
    parsed = parseOszBuffer(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ error: `failed to parse .osz: ${err.message}` });
  }

  return persistOsz({
    res,
    cid,
    buffer: req.file.buffer,
    parsed,
    originalFilename: req.file.originalname,
    sizeBytes: req.file.size,
  });
});

// Server-side import from a public osu! beatmapset id. We download the
// .osz from the NeriNyan mirror, parse + store it in GridFS like a
// normal upload. Lets the Library "Télécharger" button add a map to the
// user's Solo collection in one click without the browser re-uploading
// 50+ MB of data.
const NERINYAN_BASE = 'https://api.nerinyan.moe/d/';
const MAX_OSZ_BYTES = 200 * 1024 * 1024;

router.post('/from-osu', express.json(), async (req, res) => {
  const cid = getClientId(req);
  if (!cid) return res.status(400).json({ error: 'X-Client-Id header required' });

  const setId = String(req.body?.set_id ?? '').trim();
  if (!/^[0-9]+$/.test(setId)) {
    return res.status(400).json({ error: 'valid set_id required' });
  }

  // Skip if the user already has this set imported (avoids duplicates and
  // surfaces the existing doc to the UI right away).
  try {
    const db = await getDb();
    const existing = await db.collection('imports').findOne({
      owner_id: cid,
      osu_set_id: parseInt(setId, 10),
    });
    if (existing) {
      return res.status(200).json({ ...sanitizeImport(existing), already_imported: true });
    }
  } catch (_) { /* fall through and try the download */ }

  let buffer;
  try {
    // `?nv=1` asks the mirror to strip videos — we don't need them and
    // they bloat the .osz a lot.
    const upstream = await fetch(`${NERINYAN_BASE}${setId}?nv=1`, {
      headers: { Accept: 'application/octet-stream' },
    });
    if (!upstream.ok) {
      return res
        .status(upstream.status === 404 ? 404 : 502)
        .json({ error: `mirror responded ${upstream.status}` });
    }
    const ab = await upstream.arrayBuffer();
    if (ab.byteLength > MAX_OSZ_BYTES) {
      return res.status(413).json({ error: '.osz too large (>200MB)' });
    }
    buffer = Buffer.from(ab);
  } catch (err) {
    console.error('[imports.from-osu fetch]', err);
    return res.status(502).json({ error: `download failed: ${err.message}` });
  }

  let parsed;
  try {
    parsed = parseOszBuffer(buffer);
  } catch (err) {
    return res.status(400).json({ error: `failed to parse .osz: ${err.message}` });
  }

  return persistOsz({
    res,
    cid,
    buffer,
    parsed,
    originalFilename: `osu-${setId}.osz`,
    sizeBytes: buffer.length,
  });
});

// Shared persistence path used by both POST / (file upload) and
// POST /from-osu (server-side download).
async function persistOsz({ res, cid, buffer, parsed, originalFilename, sizeBytes }) {
  try {
    const db = await getDb();
    const oszBucket = await getOszBucket();
    const coverBucket = await getCoverBucket();
    const id = uuidv4();

    const oszFileId = await new Promise((resolve, reject) => {
      const stream = oszBucket.openUploadStream(`${id}.osz`, {
        contentType: 'application/octet-stream',
        metadata: { import_id: id, owner_id: cid },
      });
      stream.on('finish', () => resolve(stream.id));
      stream.on('error', reject);
      stream.end(buffer);
    });

    let coverFileId = null;
    if (parsed.coverBuffer) {
      coverFileId = await new Promise((resolve, reject) => {
        const stream = coverBucket.openUploadStream(`${id}-cover`, {
          contentType: parsed.coverContentType || 'image/jpeg',
          metadata: { import_id: id, owner_id: cid },
        });
        stream.on('finish', () => resolve(stream.id));
        stream.on('error', reject);
        stream.end(parsed.coverBuffer);
      });
    }

    const baseUrl = `/api/imports/${id}`;

    const difficulties = parsed.diffs.map((d, i) => ({
      id: `${id}-${i}`,
      beatmap_id: d.beatmap_id || null,
      beatmap_set_id: d.beatmap_set_id || null,
      version: d.version,
      mode: d.mode,
      difficulty_rating: d.difficulty_rating || 0,
      cs: d.cs,
      ar: d.ar,
      od: d.od,
      hp: d.hp,
      bpm: d.bpm,
      length_seconds: d.length_seconds,
      max_combo: d.max_combo || d.hit_count,
      hit_count: d.hit_count,
    }));
    const modeWeight = { osu: 0, taiko: 1, fruits: 2, mania: 3 };
    difficulties.sort((a, b) => {
      const m = (modeWeight[a.mode] || 0) - (modeWeight[b.mode] || 0);
      if (m !== 0) return m;
      return (a.difficulty_rating || 0) - (b.difficulty_rating || 0);
    });

    const osuSetId = parsed.diffs.find((d) => d.beatmap_set_id)?.beatmap_set_id || null;
    const lengthSeconds = Math.max(...difficulties.map((d) => d.length_seconds || 0), 0);

    const doc = {
      id,
      owner_id: cid,
      original_filename: originalFilename,
      title: parsed.set.title,
      title_unicode: parsed.set.title_unicode,
      artist: parsed.set.artist,
      artist_unicode: parsed.set.artist_unicode,
      creator: parsed.set.creator,
      mapper: parsed.set.creator,
      source: parsed.set.source,
      tags: typeof parsed.set.tags === 'string'
        ? parsed.set.tags.split(/\s+/).filter(Boolean)
        : (parsed.set.tags || []),
      audio_filename: parsed.set.audio_filename,
      preview_time_ms: parsed.set.preview_time_ms || 0,
      background_filename: parsed.set.background_filename,
      cover_full_url: coverFileId ? `${baseUrl}/cover` : null,
      cover_card_url: coverFileId ? `${baseUrl}/cover` : null,
      cover_url: coverFileId ? `${baseUrl}/cover` : null,
      difficulties,
      difficulty: difficulties.reduce((m, d) => Math.max(m, d.difficulty_rating || 0), 0),
      bpm: difficulties[0]?.bpm || null,
      length_seconds: lengthSeconds,
      duration_sec: lengthSeconds,
      osu_set_id: osuSetId,
      osz_file_id: oszFileId,
      cover_file_id: coverFileId,
      cover_content_type: parsed.coverContentType,
      osz_size_bytes: sizeBytes,
      is_local_import: true,
      created_at: new Date(),
    };

    await db.collection('imports').insertOne(doc);
    return res.status(201).json(sanitizeImport(doc));
  } catch (err) {
    console.error('[imports persist]', err);
    return res.status(500).json({ error: `upload failed: ${err.message}` });
  }
}

router.delete('/:id', async (req, res) => {
  const cid = getClientId(req);
  if (!cid) return res.status(400).json({ error: 'X-Client-Id header required' });
  try {
    const db = await getDb();
    const item = await db.collection('imports').findOne({ id: req.params.id, owner_id: cid });
    if (!item) return res.status(404).json({ error: 'not found' });
    try {
      const oszBucket = await getOszBucket();
      if (item.osz_file_id) await oszBucket.delete(item.osz_file_id);
    } catch (_) { /* file already gone */ }
    try {
      const coverBucket = await getCoverBucket();
      if (item.cover_file_id) await coverBucket.delete(item.cover_file_id);
    } catch (_) {}
    await db.collection('imports').deleteOne({ id: req.params.id, owner_id: cid });
    res.json({ deleted: req.params.id });
  } catch (err) {
    console.error('[imports delete]', err);
    res.status(500).json({ error: 'internal error' });
  }
});

module.exports = router;
