/**
 * beatmapAudio.js — Download an osu! beatmapset .osz from NeriNyan, extract
 * the actual song audio file, and expose it as a blob URL ready to feed to
 * an HTMLAudioElement.
 *
 * This is what powers the "selected beatmap menu music" on the Solo page.
 * Replicates exactly what the WebOsu 2 engine does internally:
 *   1. fetch https://api.nerinyan.moe/d/{beatmapsetId}    (CORS-friendly mirror)
 *   2. unzip the .osz with JSZip
 *   3. parse any .osu inside to find the `[General].AudioFilename` value
 *   4. extract the matching audio entry as a Blob, return a `URL.createObjectURL`
 *
 * Caching:
 *   - In-memory `Map<setId, blobUrl>` so the same selection is instant.
 *   - IndexedDB persistent store so reloads / future visits skip the download.
 *
 * The blob URLs are intentionally never revoked here — they live for the
 * lifetime of the tab. If memory pressure becomes an issue we can add an LRU
 * later, but for menu-music use cases this is fine (a few maps per session).
 */

import JSZip from "jszip";

// ── Tunables ────────────────────────────────────────────────────────────────
const NERINYAN_BASE = "https://api.nerinyan.moe/d/";
// Hard cap on the .osz size we are willing to fetch + decompress in the tab.
// Marathon beatmaps can exceed 50 MB and would freeze the page; we just bail
// out and leave the caller free to fall back to the short preview.
const MAX_OSZ_BYTES = 60 * 1024 * 1024; // 60 MB

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
const urlCache = new Map(); // setId(string) → blobUrl(string)
// Pending fetches so concurrent calls share the same network/decode work.
const inflight = new Map(); // setId(string) → Promise<string>

function pickMime(filename) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "ogg") return "audio/ogg";
  if (ext === "wav") return "audio/wav";
  if (ext === "m4a" || ext === "mp4") return "audio/mp4";
  return "audio/mpeg";
}

/**
 * Download + extract the song audio for a beatmapset. Resolves with a blob
 * URL pointing at the audio (already cached for subsequent calls).
 *
 * @param {number|string} setId  beatmapset id
 * @param {object} [opts]
 * @param {(progress: number) => void} [opts.onProgress] 0..1 download progress
 * @param {AbortSignal} [opts.signal] optional abort signal
 * @returns {Promise<string>}
 */
export async function fetchBeatmapAudio(setId, opts = {}) {
  if (!setId) throw new Error("setId required");
  const key = String(setId);

  // 1) memory cache
  if (urlCache.has(key)) return urlCache.get(key);
  // 2) coalesce concurrent requests
  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    // 3) IndexedDB cache
    const cached = await idbGet(key);
    if (cached && cached instanceof Blob && cached.size > 0) {
      const url = URL.createObjectURL(cached);
      urlCache.set(key, url);
      return url;
    }

    // 4) network — download .osz with progress
    const oszUrl = NERINYAN_BASE + key;
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

    // 6) find AudioFilename from any .osu file (they all share the same audio)
    let audioFilename = null;
    const osuEntries = Object.keys(zip.files).filter((n) =>
      n.toLowerCase().endsWith(".osu")
    );
    for (const name of osuEntries) {
      const content = await zip.files[name].async("text");
      const m = content.match(/^\s*AudioFilename\s*:\s*(.+?)\s*$/im);
      if (m && m[1]) {
        audioFilename = m[1].trim();
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

    // 9) persist & return URL
    await idbPut(key, audioBlob);
    const url = URL.createObjectURL(audioBlob);
    urlCache.set(key, url);
    return url;
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
  urlCache.forEach((url) => URL.revokeObjectURL(url));
  urlCache.clear();
}
