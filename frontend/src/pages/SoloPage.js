import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import BeatmapBackdrop from "@/components/BeatmapBackdrop";
import SongList from "@/components/solo/SongList";
import SongDetail from "@/components/solo/SongDetail";
import { difficultyColor } from "@/lib/format";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { fetchBeatmap } from "@/lib/api";

const STORAGE_KEY = "osuweb:lastBeatmap";

export default function SoloPage() {
  const [selectedBeatmap, setSelectedBeatmap] = useState(null);
  const [selectedDiff, setSelectedDiff] = useState(null);
  const [mods, setMods] = useState(new Set());
  const [randomKey, setRandomKey] = useState(0);
  const [searchParams] = useSearchParams();

  // If we have a previously selected map cached, the SongList must NOT
  // auto-select items[0] over our restored choice. We track whether we are
  // currently restoring so we can suppress the auto-select.
  const [restoring, setRestoring] = useState(() => {
    try { return !!localStorage.getItem(STORAGE_KEY); } catch (_) { return false; }
  });
  const restoredOnceRef = useRef(false);

  const { toggle } = useAudioPlayer();

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
      // Don't auto-toggle audio when programmatically restoring on mount.
      if (beatmap.audio_url && !opts.silent) {
        toggle(beatmap);
      }
    },
    [toggle]
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
        if (bm) handleSelect(bm, { preferredDiffId: savedDiffId, silent: !explicitId });
      })
      .catch(() => {})
      .finally(() => setRestoring(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    </div>
  );
}
