import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import BeatmapBackdrop from "@/components/BeatmapBackdrop";
import SongDetail from "@/components/solo/SongDetail";
import { difficultyColor } from "@/lib/format";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { fetchBeatmap } from "@/lib/api";
import { fetchBeatmapAudio, hasCachedBeatmapAudio } from "@/lib/beatmapAudio";

const STORAGE_KEY = "osuweb:lastBeatmap";

export default function SoloPage() {
  const [selectedBeatmap, setSelectedBeatmap] = useState(null);
  const [selectedDiff, setSelectedDiff] = useState(null);
  const [mods, setMods] = useState(new Set());
  const [searchParams] = useSearchParams();
  // Progress (0..1) of the .osz download for the currently selected beatmap.
  // null while we don't know the size yet, undefined/cleared when audio is
  // ready to play.
  const [audioFetchProgress, setAudioFetchProgress] = useState(null);

  const restoredOnceRef = useRef(false);

  const { playLast30, stop } = useAudioPlayer();
  // Track the latest fetch so a fast switch (user picks A then B before A
  // finishes downloading) doesn't end up playing the slow one over the fresh
  // selection.
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
      // `[PreviewTime → end-of-track]`.
      const setId = beatmap.id;
      if (!setId) return;

      const myToken = ++fetchTokenRef.current;
      const cachedAlready = hasCachedBeatmapAudio(setId);
      stop();
      setAudioFetchProgress(cachedAlready ? null : 0);

      fetchBeatmapAudio(setId, {
        onProgress: (p) => {
          if (fetchTokenRef.current === myToken) setAudioFetchProgress(p);
        },
      })
        .then(({ url, previewTimeMs }) => {
          if (fetchTokenRef.current !== myToken) return;
          setAudioFetchProgress(null);
          playLast30(url, beatmap, { previewTimeMs });
        })
        .catch((err) => {
          if (fetchTokenRef.current !== myToken) return;
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
    if (!idToFetch) return;

    fetchBeatmap(idToFetch)
      .then((bm) => {
        if (bm) handleSelect(bm, { preferredDiffId: savedDiffId });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Stop the menu/preview music when leaving Solo. The auto-playing
  // preview is scoped to the Solo page only.
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

      {/* Content — full-width detail panel (SongList removed). The only
          way to load a map here is now ?beatmap= param (from Library) or
          the localStorage restore. */}
      <div className="relative z-[2] flex flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedBeatmap?.id ?? "empty"}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1 min-w-0 h-full overflow-y-auto px-10 xl:px-16 py-6"
            data-lenis-prevent
            data-testid="solo-detail-panel"
          >
            <SongDetail
              beatmap={selectedBeatmap}
              selectedDiff={selectedDiff}
              onDiffChange={setSelectedDiff}
              mods={mods}
              onModToggle={toggleMod}
              accent={color}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
