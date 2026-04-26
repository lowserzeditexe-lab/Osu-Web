import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { fetchBeatmapsCategory } from "@/lib/api";
import { fetchBeatmapAudio } from "@/lib/beatmapAudio";

/**
 * PreloadContext — runs ONCE at app boot. Downloads every popular beatmap's
 * .osz audio so that any later click in Solo plays instantly.
 *
 * Lifecycle:
 *  • phase "fetching"     – pulling the beatmap list from our API
 *  • phase "downloading"  – installing audio with bounded concurrency
 *  • phase "verifying"    – initial pass done; failed maps retried in the
 *                           background indefinitely (every RETRY_INTERVAL_MS).
 *                           This phase is "permanent" but transparent — no
 *                           overlay is shown for it. We just keep trying
 *                           until everything is cached.
 *  • phase "done"         – every map cached, no failures left.
 *
 * The blocking `AppBootOverlay` is shown for "fetching" + "downloading" only.
 * Once we transition to "verifying" or "done", the overlay is dismissed and
 * the app becomes interactive — even if a few stubborn maps are still being
 * retried in the background.
 */

const PRELOAD_LIMIT = 50;
// Concurrency 2 — NeriNyan's CDN aggressively rate-limits with HTTP 429
// above ~3 parallel requests; 2 is the sweet spot.
const PRELOAD_CONCURRENCY = 2;
// Background retry pass for failed maps. We try again every 30s as long as
// there are leftovers. Stops once every map is cached.
const RETRY_INTERVAL_MS = 30000;
const RETRY_CONCURRENCY = 1;

const PreloadContext = createContext(null);

// Module-level guards. React.StrictMode mounts the provider twice in dev,
// AND runs the cleanup of the first mount BEFORE the second mount fires.
// If we used a `cancelled` boolean tied to the effect, the first mount's
// async work would bail out on `if (cancelled) return` after fetching the
// beatmap list — and the second mount would be skipped by the `startedRef`
// guard, leaving the overlay stuck on "Vérification" forever. By hoisting
// the started flag to module scope and NEVER cancelling the in-flight work,
// the preload runs exactly once per real boot and survives strict-mode
// remounts cleanly.
let _preloadStarted = false;

export function PreloadProvider({ children }) {
  const [phase, setPhase] = useState("fetching");
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  // Currently-failing set IDs. The background retry loop keeps trying these
  // until the list is empty.
  const pendingRef = useRef([]);

  useEffect(() => {
    if (_preloadStarted) return;
    _preloadStarted = true;

    // ── Solo's SongList was removed, which was the ONLY consumer of this
    // bulk preload. We now skip the popular-beatmaps download entirely so
    // the boot overlay dismisses immediately and the user can pick maps
    // ad-hoc via Library → BeatmapDetail → Play. Per-click caching is still
    // handled inside `fetchBeatmapAudio` (Map mémoire + IndexedDB).
    setPhase("done");
    return () => {};

    // eslint-disable-next-line no-unreachable
    // We deliberately do NOT cancel on unmount: this is a global one-shot
    // preload, not a per-component effect. React.StrictMode unmount/remount
    // must not abort it.
    let cancelled = false;
    let retryTimer = null;

    const runRetryPass = async () => {
      if (cancelled) return;
      const queue = [...pendingRef.current];
      if (queue.length === 0) {
        setPhase("done");
        return;
      }
      pendingRef.current = [];
      const stillFailing = [];
      const worker = async () => {
        while (queue.length > 0 && !cancelled) {
          const id = queue.shift();
          try {
            await fetchBeatmapAudio(id);
          } catch (_) {
            stillFailing.push(id);
          }
        }
      };
      await Promise.all(
        Array.from({ length: RETRY_CONCURRENCY }, () => worker())
      );
      if (cancelled) return;
      pendingRef.current = stillFailing;
      if (stillFailing.length === 0) {
        setPhase("done");
      } else {
        retryTimer = setTimeout(runRetryPass, RETRY_INTERVAL_MS);
      }
    };

    (async () => {
      // Phase 1: fetch beatmap list
      setPhase("fetching");
      let beatmaps = [];
      try {
        const data = await fetchBeatmapsCategory("popular", {
          limit: PRELOAD_LIMIT,
          offset: 0,
        });
        beatmaps = data.items || [];
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[preload] beatmap list fetch failed:", e);
        if (!cancelled) setPhase("done");
        return;
      }
      if (cancelled) return;
      setTotal(beatmaps.length);
      setDone(0);
      if (beatmaps.length === 0) {
        setPhase("done");
        return;
      }

      // Phase 2: parallel download with retry-with-backoff baked into
      // `fetchBeatmapAudio` (handles 429 / 502 / 503 / 504 transparently).
      setPhase("downloading");
      const queue = beatmaps.map((b) => b.id);
      const failed = [];
      const worker = async () => {
        while (queue.length > 0 && !cancelled) {
          const id = queue.shift();
          try {
            await fetchBeatmapAudio(id);
            if (cancelled) return;
            setDone((d) => d + 1);
          } catch (_) {
            if (cancelled) return;
            failed.push(id);
            // We still bump the counter so the bar reaches 100% on every
            // run — the user shouldn't be made to feel stuck. The background
            // retry pass will quietly mop up the failures.
            setDone((d) => d + 1);
          }
        }
      };
      await Promise.all(
        Array.from({ length: PRELOAD_CONCURRENCY }, () => worker())
      );
      if (cancelled) return;

      pendingRef.current = failed;
      if (failed.length === 0) {
        setPhase("done");
      } else {
        // Dismiss the blocking overlay (Solo becomes usable) and start the
        // permanent verification loop.
        setPhase("verifying");
        retryTimer = setTimeout(runRetryPass, RETRY_INTERVAL_MS);
      }
    })();

    return () => {
      // Strict-mode unmount: do nothing. The async work + retry timer are
      // module-scoped and intentionally outlive component lifecycle.
    };
  }, []);

  // The overlay should block boot only during the foreground passes.
  const blocking = phase === "fetching" || phase === "downloading";

  return (
    <PreloadContext.Provider
      value={{ phase, total, done, blocking }}
    >
      {children}
    </PreloadContext.Provider>
  );
}

export function usePreload() {
  const ctx = useContext(PreloadContext);
  if (!ctx) {
    throw new Error("usePreload must be used within PreloadProvider");
  }
  return ctx;
}
