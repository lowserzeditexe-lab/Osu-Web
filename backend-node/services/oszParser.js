// Server-side .osz unzip + .osu metadata parser.
//
// We extract the *minimum* needed to render the same UI as an OSU API
// beatmapset: title/artist/creator, per-diff CS/AR/OD/HP/BPM/length, and
// the set-level audio + background filenames. We deliberately do NOT try
// to compute star ratings server-side — that requires a difficulty
// calculator (rosu-pp) which is overkill for an MVP. Stars are 0 for
// imports and the UI shows them as "local".
const AdmZip = require('adm-zip');

function parseSections(text) {
  const sections = {};
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      current = line.slice(1, -1);
      sections[current] = sections[current] || [];
      continue;
    }
    if (current) sections[current].push(raw);
  }
  return sections;
}

function kvOf(arr) {
  const out = {};
  for (const l of arr || []) {
    const idx = l.indexOf(':');
    if (idx === -1) continue;
    const k = l.slice(0, idx).trim();
    const v = l.slice(idx + 1).trim();
    out[k] = v;
  }
  return out;
}

function parseOsuMeta(text) {
  const sections = parseSections(text);
  const general = kvOf(sections.General);
  const meta = kvOf(sections.Metadata);
  const diff = kvOf(sections.Difficulty);

  // BPM: median of uninherited timing points (beatLength > 0 means uninherited).
  let bpm = null;
  if (sections.TimingPoints) {
    const beats = [];
    for (const l of sections.TimingPoints) {
      const parts = l.split(',');
      if (parts.length < 2) continue;
      const beatLength = parseFloat(parts[1]);
      if (Number.isFinite(beatLength) && beatLength > 0) beats.push(60000 / beatLength);
    }
    if (beats.length) {
      beats.sort((a, b) => a - b);
      bpm = Math.round(beats[Math.floor(beats.length / 2)]);
    }
  }

  // Length: time of last hit object (in ms).
  let lastHitMs = 0;
  let hitCount = 0;
  if (sections.HitObjects) {
    for (const l of sections.HitObjects) {
      const parts = l.split(',');
      if (parts.length < 3) continue;
      const t = parseInt(parts[2], 10);
      if (Number.isFinite(t) && t > lastHitMs) lastHitMs = t;
      hitCount += 1;
    }
  }

  // Background image: first `0,0,"file.jpg",...` line in [Events].
  let backgroundFilename = null;
  if (sections.Events) {
    for (const l of sections.Events) {
      const m = l.match(/^\s*0\s*,\s*0\s*,\s*"([^"]+)"/);
      if (m) { backgroundFilename = m[1]; break; }
    }
  }

  const modeNum = parseInt(general.Mode || '0', 10);
  const modeStr = ['osu', 'taiko', 'fruits', 'mania'][modeNum] || 'osu';

  return {
    audio_filename: general.AudioFilename || null,
    preview_time_ms: parseInt(general.PreviewTime || '0', 10),
    title: meta.Title || '(unknown)',
    title_unicode: meta.TitleUnicode || meta.Title || '(unknown)',
    artist: meta.Artist || '(unknown)',
    artist_unicode: meta.ArtistUnicode || meta.Artist || '(unknown)',
    creator: meta.Creator || '',
    source: meta.Source || '',
    tags: meta.Tags || '',
    version: meta.Version || '',
    beatmap_id: meta.BeatmapID ? parseInt(meta.BeatmapID, 10) : null,
    beatmap_set_id: meta.BeatmapSetID ? parseInt(meta.BeatmapSetID, 10) : null,
    cs: parseFloat(diff.CircleSize) || 0,
    ar: parseFloat(diff.ApproachRate) || 0,
    od: parseFloat(diff.OverallDifficulty) || 0,
    hp: parseFloat(diff.HPDrainRate) || 0,
    slider_multiplier: parseFloat(diff.SliderMultiplier) || 1,
    bpm,
    length_seconds: Math.round(lastHitMs / 1000),
    hit_count: hitCount,
    background_filename: backgroundFilename,
    mode: modeStr,
  };
}

function parseOszBuffer(buffer) {
  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch (err) {
    throw new Error(`not a valid .osz archive: ${err.message}`);
  }
  const entries = zip.getEntries();
  const osuEntries = entries.filter(
    (e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.osu')
  );
  if (!osuEntries.length) throw new Error('no .osu file inside the .osz archive');

  const diffs = [];
  for (const e of osuEntries) {
    try {
      const text = e.getData().toString('utf8');
      diffs.push(parseOsuMeta(text));
    } catch (_) {
      // skip broken diff
    }
  }
  if (!diffs.length) throw new Error('all .osu files failed to parse');

  // Set-level metadata: take the first diff's title/artist/creator (these are
  // the same across diffs in a normal mapset).
  const first = diffs[0];
  const set = {
    title: first.title,
    title_unicode: first.title_unicode,
    artist: first.artist,
    artist_unicode: first.artist_unicode,
    creator: first.creator,
    source: first.source,
    tags: first.tags,
    audio_filename: first.audio_filename,
    preview_time_ms: first.preview_time_ms,
    background_filename: first.background_filename,
  };

  // Extract background image bytes (case-insensitive lookup since osz paths
  // are inconsistent on Windows-authored maps).
  let coverBuffer = null;
  let coverContentType = null;
  if (first.background_filename) {
    const wanted = first.background_filename.toLowerCase().replace(/\\/g, '/');
    const bgEntry = entries.find(
      (e) => !e.isDirectory && e.entryName.toLowerCase().replace(/\\/g, '/') === wanted
    );
    if (bgEntry) {
      coverBuffer = bgEntry.getData();
      const ext = first.background_filename.split('.').pop().toLowerCase();
      coverContentType =
        ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    }
  }

  return { set, diffs, coverBuffer, coverContentType };
}

module.exports = { parseOszBuffer };
