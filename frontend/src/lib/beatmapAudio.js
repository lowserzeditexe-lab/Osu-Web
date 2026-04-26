/**
 * beatmapAudio.js — Download an osu! beatmapset .osz from NeriNyan, extract
 * the actual song audio file AND the mapper-defined `PreviewTime`, then
 * expose both as a ready-to-use blob URL plus the preview offset.
 *
 * This is what powers the "selected beatmap menu music" on the Solo page.
 * Replicates exactly what the WebOsu 2 engine does internally:
 *   1. fetch https://api.nerinyan.moe/d/{beatmapsetId}    (CORS-friendly mirror)
 *   2. unzip the .osz with JSZip
 *   3. parse any .osu inside to find `[General].AudioFilename` AND
 *      `[General].PreviewTime` (milliseconds — the mapper-curated "best"
 *      starting point of the song, e.g. drop/chorus/kiai start)
 *   4. extract the matching audio entry as a Blob, return
 *      `{ url: createObjectURL(blob), previewTimeMs }`
 *
 * Real osu! plays its song-select preview by SEEKING to `PreviewTime` and
 * looping `[PreviewTime, end-of-track]`. We do exactly the same — see
 * `AudioPlayerContext` "last30" mode (kept as an internal name for code
 * stability; the actual window is now driven by PreviewTime).
 *
 * Caching:
 *   - In-memory `Map<setId, {url, previewTimeMs}>` so the same selection is
 *     instant.
 *   - IndexedDB persistent store (single object per set) so reloads / future
 *     visits skip the download.
 */

import JSZip from "jszip";

// ── Tunables ────────────────────────────────────────────────────────────────
// `?nv=1` asks NeriNyan to strip the video file from the .osz, which is by
// far the biggest contributor to archive size. Without this, even popular
// maps with a 50 MB MP4 would blow past our cap and the user would hear no
// audio. We never need the video for the menu music, so this is pure win.
const NERINYAN_BASE = "https://api.nerinyan.moe/d/";
const NERINYAN_QUERY = "?nv=1";
// Hard cap on the .osz size we are willing to fetch + decompress in the tab.
// Bumped to 200 MB so marathon maps (10+ minute songs) still load cleanly.
// With `?nv=1` removing video this is plenty for ~99% of ranked beatmaps.
const MAX_OSZ_BYTES = 200 * 1024 * 1024; // 200 MB

// ── IndexedDB helpers ───────────────────────────────────────────────────────
const DB_NAME = "osu_audio_cache";
const STORE = "audio_blobs";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no IDB"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (_) {
    return null;
  }
}

async function idbPut(key, value) {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (_) {
    return false;
  }
}

// ── In-memory blob URL cache (per-tab) ─────────────────────────────────────
// Each entry: { url: string, previewTimeMs: number }
const urlCache = new Map();
// Pending fetches so concurrent calls share the same network/decode work.
const inflight = new Map(); // setId(string) → Promise<{url, previewTimeMs}>

function pickMime(filename) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "ogg") return "audio/ogg";
  if (ext === "wav") return "audio/wav";
  if (ext === "m4a" || ext === "mp4") return "audio/mp4";
  return "audio/mpeg";
}

/**
 * Parse a `.osu` file's `[General]` section for `AudioFilename` and
 * `PreviewTime`. We only need these two — both are required for our use
 * case and they live near the very top of the file, so a regex match on
 * the first ~10 KB is enough.
 *
 * @param {string} osuText
 * @returns {{ audioFilename: string|null, previewTimeMs: number }}
 */
function parseGeneralSection(osuText) {
  const audioMatch = osuText.match(/^\s*AudioFilename\s*:\s*(.+?)\s*$/im);
  const previewMatch = osuText.match(/^\s*PreviewTime\s*:\s*(-?\d+)\s*$/im);
  return {
    audioFilename: audioMatch ? audioMatch[1].trim() : null,
    // PreviewTime defaults to -1 in .osu when unset; we normalise to 0 so
    // the caller can `Math.max(0, …)` without surprises. Real value is
    // already in milliseconds.
    previewTimeMs: previewMatch ? Math.max(0, parseInt(previewMatch[1], 10) || 0) : 0,
  };
}

/**
 * Download + extract the song audio for a beatmapset. Resolves with the
 * full-track blob URL AND the mapper-defined PreviewTime (in milliseconds).
 *
 * Subsequent calls for the same setId are instant (memory + IndexedDB).
 *
 * @param {number|string} setId  beatmapset id
 * @param {object} [opts]
 * @param {(progress: number) => void} [opts.onProgress] 0..1 download progress
 * @param {AbortSignal} [opts.signal] optional abort signal
 * @returns {Promise<{ url: string, previewTimeMs: number }>}
 */
export async function fetchBeatmapAudio(setId, opts = {}) {
  if (!setId) throw new Error("setId required");
  const key = String(setId);

  // 1) memory cache
  if (urlCache.has(key)) return urlCache.get(key);
  // 2) coalesce concurrent requests
  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    // 3) IndexedDB cache — stores { blob, previewTimeMs }.
    //    For backwards-compat we also accept legacy entries that were just a
    //    raw Blob (audio only, no preview time) and treat them as 0.
    const cached = await idbGet(key);
    if (cached) {
      let blob = null;
      let previewTimeMs = 0;
      if (cached instanceof Blob && cached.size > 0) {
        // legacy entry — audio only
        blob = cached;
      } else if (cached && cached.blob instanceof Blob && cached.blob.size > 0) {
        blob = cached.blob;
        previewTimeMs = Number(cached.previewTimeMs) || 0;
      }
      if (blob) {
        const url = URL.createObjectURL(blob);
        const result = { url, previewTimeMs };
        urlCache.set(key, result);
        return result;
      }
    }

    // 4) network — download .osz with progress (no video to keep size sane)
    const oszUrl = NERINYAN_BASE + key + NERINYAN_QUERY;
    const response = await fetch(oszUrl, {
      signal: opts.signal,
      // NeriNyan sets CORS already; no credentials needed.
      mode: "cors",
    });
    if (!response.ok) {
      throw new Error(`nerinyan HTTP ${response.status} for set ${key}`);
    }
    const totalRaw = response.headers.get("content-length");
    const total = totalRaw ? parseInt(totalRaw, 10) : 0;
    if (total > MAX_OSZ_BYTES) {
      throw new Error(`.osz too large (${(total / 1048576).toFixed(1)} MB)`);
    }

    let chunks = [];
    let loaded = 0;
    if (response.body && response.body.getReader) {
      const reader = response.body.getReader();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (loaded > MAX_OSZ_BYTES) {
          try { await reader.cancel(); } catch (_) { /* ignore */ }
          throw new Error(`.osz exceeded ${MAX_OSZ_BYTES} bytes`);
        }
        if (opts.onProgress && total > 0) {
          opts.onProgress(loaded / total);
        }
      }
    } else {
      // Older browsers without streaming — single shot.
      const buf = await response.arrayBuffer();
      if (buf.byteLength > MAX_OSZ_BYTES) {
        throw new Error(`.osz too large (${(buf.byteLength / 1048576).toFixed(1)} MB)`);
      }
      chunks = [new Uint8Array(buf)];
      loaded = buf.byteLength;
      if (opts.onProgress) opts.onProgress(1);
    }
    const oszBlob = new Blob(chunks);

    // 5) unzip
    const zip = await JSZip.loadAsync(oszBlob);

    // 6) Find AudioFilename + PreviewTime by parsing any .osu file. All diffs
    //    of a beatmapset share the same audio file, but `PreviewTime` is
    //    technically per-difficulty. We pick the FIRST .osu we encounter —
    //    in practice mappers keep PreviewTime identical across diffs (the
    //    osu! editor writes the same value when you set "Preview point").
    let audioFilename = null;
    let previewTimeMs = 0;
    const osuEntries = Object.keys(zip.files).filter((n) =>
      n.toLowerCase().endsWith(".osu")
    );
    for (const name of osuEntries) {
      const content = await zip.files[name].async("text");
      const parsed = parseGeneralSection(content);
      if (parsed.audioFilename) {
        audioFilename = parsed.audioFilename;
        previewTimeMs = parsed.previewTimeMs;
        break;
      }
    }
    if (!audioFilename) {
      throw new Error("AudioFilename not found in any .osu inside the archive");
    }

    // 7) locate the audio entry (case-insensitive)
    const wanted = audioFilename.toLowerCase();
    const audioName = Object.keys(zip.files).find(
      (n) => n.toLowerCase() === wanted
    );
    if (!audioName) {
      throw new Error(`audio file "${audioFilename}" not present in .osz`);
    }

    // 8) extract audio bytes, retag with the proper MIME so HTMLAudioElement
    //    picks the correct decoder regardless of what zip.async("blob") gave.
    let audioBlob = await zip.files[audioName].async("blob");
    audioBlob = new Blob([audioBlob], { type: pickMime(audioFilename) });

    // 9) persist (blob + previewTimeMs together) & return
    await idbPut(key, { blob: audioBlob, previewTimeMs });
    const url = URL.createObjectURL(audioBlob);
    const result = { url, previewTimeMs };
    urlCache.set(key, result);
    return result;
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}

/** True if this beatmapset's audio has already been resolved in this tab. */
export function hasCachedBeatmapAudio(setId) {
  return urlCache.has(String(setId));
}

/** Best-effort cleanup — only useful for tests. */
export function _clearAudioCache() {
  urlCache.forEach((entry) => URL.revokeObjectURL(entry.url));
  urlCache.clear();
}
