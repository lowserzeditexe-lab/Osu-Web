import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import BeatmapBackdrop from "@/components/BeatmapBackdrop";
import SongDetail from "@/components/solo/SongDetail";
import ProfileCard from "@/components/solo/ProfileCard";
import ImportsList from "@/components/solo/ImportsList";
import DropOverlay from "@/components/solo/DropOverlay";
import { difficultyColor } from "@/lib/format";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { useImports } from "@/contexts/ImportsContext";
import { fetchBeatmapAudio, hasCachedBeatmapAudio } from "@/lib/beatmapAudio";
import { importFileUrl } from "@/lib/userApi";

/**
 * Solo page — user's own imported beatmaps.
 *
 * Per user spec: Solo NEVER auto-plays anything on mount. The user picks a
 * map by either (a) selecting one from their imports list, or (b) dropping
 * a .osz file on the page (full-page overlay confirms the drop, then the
 * file is uploaded to the backend → parsed → added to the list).
 */
export default function SoloPage() {
  const [selectedBeatmap, setSelectedBeatmap] = useState(null);
  const [selectedDiff, setSelectedDiff] = useState(null);
  const [mods, setMods] = useState(new Set());
  const [audioFetchProgress, setAudioFetchProgress] = useState(null);

  const { playLast30, stop } = useAudioPlayer();
  const fetchTokenRef = useRef(0);

  const { imports, upload, uploadProgress, uploadError } = useImports();

  // ── Selection logic ───────────────────────────────────────────────
  // Picks a beatmap, sets the hardest diff by default, downloads the
  // matching .osz audio (from our own /api/imports/:id/file for local
  // imports, or from NeriNyan via setId for OSU API maps) and starts the
  // preview loop.
  const handleSelect = useCallback(
    (beatmap) => {
      if (!beatmap) {
        setSelectedBeatmap(null);
        setSelectedDiff(null);
        stop();
        return;
      }
      setSelectedBeatmap(beatmap);
      let chosenDiff = null;
      if (beatmap.difficulties?.length > 0) {
        const sorted = [...beatmap.difficulties].sort(
          (a, b) => (b.difficulty_rating || 0) - (a.difficulty_rating || 0)
        );
        chosenDiff = sorted[0];
        setSelectedDiff(chosenDiff);
      } else {
        setSelectedDiff(null);
      }

      const setId = beatmap.id;
      if (!setId) return;

      const myToken = ++fetchTokenRef.current;
      const cachedAlready = hasCachedBeatmapAudio(setId);
      stop();
      setAudioFetchProgress(cachedAlready ? null : 0);

      // For local imports, point the audio fetcher at our own endpoint
      // (overrideUrl). The fetcher unzips the .osz client-side for
      // PreviewTime + audio, exactly like for OSU API maps.
      const opts = {
        onProgress: (p) => {
          if (fetchTokenRef.current === myToken) setAudioFetchProgress(p);
        },
      };
      if (beatmap.is_local_import) {
        opts.overrideUrl = importFileUrl(beatmap.id);
      }

      fetchBeatmapAudio(setId, opts)
        .then(({ url, previewTimeMs }) => {
          if (fetchTokenRef.current !== myToken) return;
          setAudioFetchProgress(null);
          playLast30(url, beatmap, { previewTimeMs });
        })
        .catch((err) => {
          if (fetchTokenRef.current !== myToken) return;
          // eslint-disable-next-line no-console
          console.warn("[solo] audio fetch failed:", err?.message || err);
          setAudioFetchProgress(null);
        });
    },
    [playLast30, stop]
  );

  // If the currently-selected import gets deleted from the list, clear it.
  useEffect(() => {
    if (!selectedBeatmap) return;
    const stillThere = imports.some((it) => it.id === selectedBeatmap.id);
    if (!stillThere) {
      setSelectedBeatmap(null);
      setSelectedDiff(null);
      stop();
    }
  }, [imports, selectedBeatmap, stop]);

  // Stop the menu/preview music when leaving Solo.
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  // ── Drag-and-drop file upload ─────────────────────────────────────
  // We listen on the window for dragenter/dragleave/drop so the entire
  // Solo page is a drop target, not just a small box. A counter avoids
  // flicker when dragging over child elements (each child fires
  // dragenter/dragleave too).
  const [dragging, setDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const [uploadingFilename, setUploadingFilename] = useState(null);

  const handleFiles = useCallback(
    async (files) => {
      const oszFiles = Array.from(files || []).filter(
        (f) => f && f.name && /\.osz$/i.test(f.name)
      );
      if (!oszFiles.length) return;
      for (const file of oszFiles) {
        setUploadingFilename(file.name);
        try {
          const doc = await upload(file);
          // Auto-select the first uploaded map so the user sees it open in
          // the detail panel right away.
          if (doc) handleSelect(doc);
        } catch (_) { /* error already surfaced via uploadError */ }
      }
      setUploadingFilename(null);
    },
    [upload, handleSelect]
  );

  useEffect(() => {
    function onDragEnter(e) {
      // Only react to file drags, not text/element drags.
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes("Files")) return;
      e.preventDefault();
      dragCounterRef.current += 1;
      setDragging(true);
    }
    function onDragOver(e) {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
    function onDragLeave(e) {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes("Files")) return;
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setDragging(false);
      }
    }
    function onDrop(e) {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes("Files")) return;
      e.preventDefault();
      dragCounterRef.current = 0;
      setDragging(false);
      handleFiles(e.dataTransfer.files);
    }
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [handleFiles]);

  // ── Random pick from imports ──────────────────────────────────────
  const handleRandom = useCallback(() => {
    if (!imports.length) return;
    const next = imports[Math.floor(Math.random() * imports.length)];
    handleSelect(next);
  }, [imports, handleSelect]);

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

  const color = selectedDiff
    ? difficultyColor(selectedDiff.difficulty_rating)
    : selectedBeatmap
    ? difficultyColor(selectedBeatmap.difficulty)
    : "#b388ff";

  // For local-imported beatmaps, the cover URL is relative to the backend.
  const beBase = process.env.REACT_APP_BACKEND_URL || "";
  const rawCover =
    selectedBeatmap?.cover_full_url ||
    selectedBeatmap?.cover_card_url ||
    selectedBeatmap?.cover_url ||
    null;
  const backdropSrc =
    rawCover && rawCover.startsWith("/api/") ? `${beBase}${rawCover}` : rawCover;

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      data-testid="solo-page"
    >
      <BeatmapBackdrop src={backdropSrc} accent={color} />

      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background:
            "linear-gradient(100deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.62) 38%, rgba(0,0,0,0.28) 62%, rgba(0,0,0,0.45) 100%)",
        }}
      />

      {/* ── Top bar ── */}
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

      {/* ── Content : 2 columns ── */}
      <div className="relative z-[2] flex flex-1 overflow-hidden gap-4 px-4 pb-4">
        {/* Left: detail panel */}
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedBeatmap?.id ?? "empty"}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1 min-w-0 h-full overflow-y-auto px-6 xl:px-10 py-2"
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

        {/* Right: profile + imports list */}
        <div className="flex-shrink-0 w-[340px] h-full flex flex-col gap-3" data-testid="solo-right-column">
          <ProfileCard
            accent={color}
            beatmap={selectedBeatmap}
            selectedDiff={selectedDiff}
            mods={mods}
            onModToggle={toggleMod}
            onRandom={imports.length > 1 ? handleRandom : null}
          />
          <div className="flex-1 min-h-0">
            <ImportsList
              selectedId={selectedBeatmap?.id}
              onSelect={handleSelect}
              onPickFiles={handleFiles}
              accent={color}
            />
          </div>
        </div>
      </div>

      {/* ── Drop overlay (full-page) ── */}
      <DropOverlay
        visible={dragging || uploadProgress !== null}
        mode={uploadProgress !== null ? "uploading" : "drop"}
        progress={uploadProgress || 0}
        uploadingFilename={uploadingFilename}
        errorMessage={uploadError}
      />

      {/* Audio fetch progress (when an existing map is being downloaded for
          preview) — keep the overlay slim, bottom-right. */}
      {audioFetchProgress !== null && (
        <div
          className="absolute bottom-4 left-4 z-[60] rounded-full bg-black/70 backdrop-blur-md border border-white/10 px-4 py-2 text-[10.5px] uppercase tracking-[0.22em] text-white/65 font-semibold"
          data-testid="solo-audio-fetch-progress"
        >
          Audio · {Math.round((audioFetchProgress || 0) * 100)}%
        </div>
      )}
    </div>
  );
}
