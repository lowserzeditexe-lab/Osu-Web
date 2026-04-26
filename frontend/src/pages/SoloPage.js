import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import BeatmapBackdrop from "@/components/BeatmapBackdrop";
import SongList from "@/components/solo/SongList";
import SongDetail from "@/components/solo/SongDetail";
import SoloPreloadOverlay from "@/components/solo/SoloPreloadOverlay";
import { difficultyColor } from "@/lib/format";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { fetchBeatmap, fetchBeatmapsCategory } from "@/lib/api";
import { fetchBeatmapAudio, hasCachedBeatmapAudio } from "@/lib/beatmapAudio";

const STORAGE_KEY = "osuweb:lastBeatmap";
// Number of popular maps we eagerly install at Solo page launch. Matches
// SongList's PAGE_SIZE so the entire initial visible list is ready to play
// the moment the overlay disappears. Concurrency 2 keeps NeriNyan happy
// (its CDN aggressively rate-limits with 429 above ~3 parallel requests).
const PRELOAD_LIMIT = 50;
const PRELOAD_CONCURRENCY = 2;

export default function SoloPage() {
  const [selectedBeatmap, setSelectedBeatmap] = useState(null);
  const [selectedDiff, setSelectedDiff] = useState(null);
  const [mods, setMods] = useState(new Set());
  const [randomKey, setRandomKey] = useState(0);
  const [searchParams] = useSearchParams();
  // Progress (0..1) of the .osz download for the currently selected beatmap.
  // null while we don't know the size yet, undefined/cleared when audio is
  // ready to play. Used by SongDetail to render a tiny progress hint while
  // the user waits the first time they pick a marathon-sized map.
  const [audioFetchProgress, setAudioFetchProgress] = useState(null);

  // If we have a previously selected map cached, the SongList must NOT
  // auto-select items[0] over our restored choice. We track whether we are
  // currently restoring so we can suppress the auto-select.
  const [restoring, setRestoring] = useState(() => {
    try { return !!localStorage.getItem(STORAGE_KEY); } catch (_) { return false; }
  });
  const restoredOnceRef = useRef(false);

  // ── Preload state. We eagerly download every popular map's audio at
  // launch so that clicking a song produces instant playback. The overlay
  // is shown until `phase === "done"`, blocking the rest of the UI. We
  // intentionally do NOT offer a skip button (user requirement: force
  // full preload).
  const [preload, setPreload] = useState({
    phase: "fetching", // "fetching" | "preloading" | "done"
    total: 0,
    done: 0,
    currentTitle: null,
    failed: [], // [{ id, title, error }]
  });
  // Auto-dismiss the overlay a short moment after completion so the user
  // sees the final "Installation terminée" state for ~700 ms before the
  // Solo UI fades in.
  const [overlayVisible, setOverlayVisible] = useState(true);

  const { playLast30, stop } = useAudioPlayer();
  // Track the latest fetch so a fast switch (user clicks song A then B before
  // A finishes downloading) doesn't end up playing the slow one over the
  // fresh selection.
  const fetchTokenRef = useRef(0);

  const handleSelect = useCallback(
    (beatmap, opts = {}) => {
      if (!beatmap) return;
      setSelectedBeatmap(beatmap);
      let chosenDiff = null;
      if (beatmap.difficulties?.length > 0) {
        // Honour a previously selected diff if asked; otherwise pick the hardest.
        if (opts.preferredDiffId) {
          chosenDiff = beatmap.difficulties.find((d) => d.id === opts.preferredDiffId) || null;
        }
        if (!chosenDiff) {
          const sorted = [...beatmap.difficulties].sort(
            (a, b) => b.difficulty_rating - a.difficulty_rating
          );
          chosenDiff = sorted[0];
        }
        setSelectedDiff(chosenDiff);
      } else {
        setSelectedDiff(null);
      }
      // Persist for next visit (id only — we re-fetch on restore).
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ id: beatmap.id, diffId: chosenDiff?.id || null })
        );
      } catch (_) { /* private mode etc. */ }

      // ── Background music: replicate real osu! song-select. We download
      // the full beatmap audio from the .osz, then loop
      // `[PreviewTime → end-of-track]`. There is intentionally NO short
      // "preview" bridge while the .osz downloads — playing the OSU API
      // 10s preview clip first only to swap to the full track at the
      // exact same PreviewTime caused an audible "double-play" hiccup
      // (the same musical phrase was heard twice in a row). Better to
      // wait briefly in silence and then start cleanly on the real track.
      const setId = beatmap.id;
      if (!setId) return;

      const myToken = ++fetchTokenRef.current;
      const cachedAlready = hasCachedBeatmapAudio(setId);
      // Stop any currently playing audio (preview or previous full track)
      // so we don't bleed sound from the previously selected song into
      // the silent gap before this map's audio is ready.
      stop();
      setAudioFetchProgress(cachedAlready ? null : 0);

      fetchBeatmapAudio(setId, {
        onProgress: (p) => {
          // Only update progress if this fetch is still the active one.
          if (fetchTokenRef.current === myToken) setAudioFetchProgress(p);
        },
      })
        .then(({ url, previewTimeMs }) => {
          // Stale fetch (user already moved on)? Discard.
          if (fetchTokenRef.current !== myToken) return;
          setAudioFetchProgress(null);
          // Pass the mapper-defined PreviewTime so the AudioPlayer can loop
          // [PreviewTime, end-of-track] just like real osu! song-select.
          playLast30(url, beatmap, { previewTimeMs });
        })
        .catch((err) => {
          if (fetchTokenRef.current !== myToken) return;
          // Full-track fetch failed (offline, .osz too big, NeriNyan down,
          // archive without AudioFilename…). Keep silent — we don't want
          // the short OSU preview to surprise-play here either.
          // eslint-disable-next-line no-console
          console.warn("[solo] fullTrack audio failed:", err?.message || err);
          setAudioFetchProgress(null);
        });
    },
    [playLast30, stop]
  );

  // Pre-load beatmap from ?beatmap= param (coming from detail page) or from
  // the persisted localStorage value (so the user keeps the same selection).
  useEffect(() => {
    if (restoredOnceRef.current) return;
    restoredOnceRef.current = true;

    const explicitId = searchParams.get("beatmap");
    let savedId = null;
    let savedDiffId = null;
    if (!explicitId) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.id) {
            savedId = parsed.id;
            savedDiffId = parsed.diffId || null;
          }
        }
      } catch (_) {}
    }
    const idToFetch = explicitId || savedId;
    if (!idToFetch) {
      setRestoring(false);
      return;
    }

    fetchBeatmap(idToFetch)
      .then((bm) => {
        if (bm) handleSelect(bm, { preferredDiffId: savedDiffId });
      })
      .catch(() => {})
      .finally(() => setRestoring(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── EAGER PRELOAD ─────────────────────────────────────────────────────
  // On Solo page mount, download every popular beatmap's audio (.osz →
  // mp3) up-front so that clicking a song produces instant playback. We
  // run PRELOAD_CONCURRENCY workers in parallel — too many parallel
  // requests trigger 502 from NeriNyan. The retry-with-backoff in
  // `fetchBeatmapAudio` smooths over the rest. Permanent failures (after
  // 3 retries) are collected and shown in the overlay's failure list.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Phase 1: fetch the metadata list
      let beatmaps = [];
      try {
        const data = await fetchBeatmapsCategory("popular", {
          limit: PRELOAD_LIMIT,
          offset: 0,
        });
        beatmaps = data.items || [];
      } catch (e) {
        // If even the list fails, we can't preload. Mark as done so the
        // overlay disappears — the user will see whatever SongList can
        // recover by itself.
        if (cancelled) return;
        setPreload((p) => ({ ...p, phase: "done", total: 0, done: 0 }));
        // eslint-disable-next-line no-console
        console.error("[solo-preload] failed to fetch popular list:", e);
        return;
      }
      if (cancelled) return;
      const total = beatmaps.length;
      setPreload({
        phase: "preloading",
        total,
        done: 0,
        currentTitle: null,
        failed: [],
      });
      if (total === 0) {
        setPreload((p) => ({ ...p, phase: "done" }));
        return;
      }

      // Phase 2: parallel preload with bounded concurrency
      const queue = [...beatmaps];
      const worker = async () => {
        while (queue.length > 0 && !cancelled) {
          const bm = queue.shift();
          if (!bm) break;
          // Reflect the in-progress title in the overlay (best-effort —
          // racey across workers but the user just sees a churn of titles).
          setPreload((p) => ({
            ...p,
            currentTitle: bm.title || `Set ${bm.id}`,
          }));
          try {
            await fetchBeatmapAudio(bm.id);
            if (cancelled) return;
            setPreload((p) => ({ ...p, done: p.done + 1 }));
          } catch (e) {
            if (cancelled) return;
            const msg = (e && e.message) ? e.message : String(e);
            // Trim long error messages so the failure list stays readable.
            const short = msg.length > 38 ? msg.slice(0, 38) + "…" : msg;
            setPreload((p) => ({
              ...p,
              done: p.done + 1,
              failed: [
                ...p.failed,
                { id: bm.id, title: bm.title || `Set ${bm.id}`, error: short },
              ],
            }));
          }
        }
      };
      const workers = Array.from({ length: PRELOAD_CONCURRENCY }, () => worker());
      await Promise.all(workers);
      if (cancelled) return;

      // Phase 3: done. Hold the "terminé" state briefly, then dismiss.
      setPreload((p) => ({ ...p, phase: "done", currentTitle: null }));
      setTimeout(() => {
        if (!cancelled) setOverlayVisible(false);
      }, 800);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Stop the menu/preview music when leaving Solo. The user explicitly
  // asked for the auto-playing preview to stay scoped to the Solo page only,
  // so we tear down the audio source on unmount (navigation to /, /library,
  // /play, etc.). The looping preview resumes again when the user comes
  // back to /solo and a beatmap is restored / selected.
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  const color = selectedDiff
    ? difficultyColor(selectedDiff.difficulty_rating)
    : selectedBeatmap
    ? difficultyColor(selectedBeatmap.difficulty)
    : "#b388ff";

  const backdropSrc =
    selectedBeatmap?.cover_full_url ||
    selectedBeatmap?.cover_card_url ||
    selectedBeatmap?.cover_url ||
    null;

  function handleRandom() {
    setRandomKey((k) => k + 1);
  }

  function toggleMod(key) {
    setMods((prev) => {
      const next = new Set(prev);
      const exclusives = { DT: "HT", HT: "DT", NC: "DT", EZ: "HR", HR: "EZ" };
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (exclusives[key]) next.delete(exclusives[key]);
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      data-testid="solo-page"
    >
      {/* Full-bleed blurred cover background */}
      <BeatmapBackdrop src={backdropSrc} accent={color} />

      {/* Left-to-right readability gradient over the backdrop */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background:
            "linear-gradient(100deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.62) 38%, rgba(0,0,0,0.28) 62%, rgba(0,0,0,0.45) 100%)",
        }}
      />

      {/* ── Top bar: logo + Library link ── */}
      <div className="relative z-[3] flex items-center justify-between px-6 md:px-10 py-3 flex-shrink-0">
        <Link
          to="/"
          data-testid="solo-logo"
          className="group flex items-end gap-2 select-none rounded-full border border-white/10 bg-black/40 backdrop-blur-md px-4 py-2 hover:border-white/25 transition-colors"
        >
          <span className="text-[18px] font-semibold tracking-tight text-white leading-none">
            osu<span className="text-[#ff66aa]">!</span>
          </span>
          <span className="text-[10px] uppercase tracking-[0.28em] text-white/50 pb-[2px] group-hover:text-white/80 transition-colors">
            web
          </span>
        </Link>

        <Link
          to="/library"
          data-testid="solo-library-link"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 backdrop-blur-md px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-white/60 hover:text-white hover:border-white/25 transition-colors font-semibold"
        >
          Library
          <ArrowUpRight size={13} strokeWidth={2} />
        </Link>
      </div>

      {/* Content */}
      <div className="relative z-[2] flex flex-1 overflow-hidden">
        {/* ── Left: song detail ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedBeatmap?.id ?? "empty"}
            initial={{ opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1 min-w-0 h-full overflow-y-auto pl-10 pr-6 xl:pl-16 xl:pr-10 py-6"
            data-lenis-prevent
            data-testid="solo-detail-panel"
          >
            <SongDetail
              beatmap={selectedBeatmap}
              selectedDiff={selectedDiff}
              onDiffChange={setSelectedDiff}
              mods={mods}
              onModToggle={toggleMod}
              onRandom={handleRandom}
              accent={color}
            />
          </motion.div>
        </AnimatePresence>

        {/* ── Right: cascading skewed song list ── */}
        <div
          className="relative w-1/2 flex-shrink-0 h-full"
          data-testid="solo-song-list"
        >
          <SongList
            key={randomKey}
            selectedId={selectedBeatmap?.id}
            selectedBeatmap={selectedBeatmap}
            selectedDiff={selectedDiff}
            onSelect={handleSelect}
            onDiffChange={setSelectedDiff}
            onRandom={handleRandom}
            mods={mods}
            onModToggle={toggleMod}
            accent={color}
          />
        </div>
      </div>

      {/* ── Eager preload overlay (blocks UI until installation done) ── */}
      <AnimatePresence>
        {overlayVisible && (
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="fixed inset-0 z-[100]"
          >
            <SoloPreloadOverlay
              total={preload.total}
              done={preload.done}
              failed={preload.failed}
              currentTitle={preload.currentTitle}
              phase={preload.phase}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
