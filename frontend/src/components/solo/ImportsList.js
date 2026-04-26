import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileMusic, Trash2, Upload, Loader2 } from "lucide-react";
import SongCard from "./SongCard";
import DiffList from "./DiffList";
import { useImports } from "@/contexts/ImportsContext";

/**
 * Right-column list of the user's imported beatmaps. Renders each import
 * with the same parallelogram SongCard used across the rest of Solo, and
 * expands the selected card with a DiffList of the diffs found inside the
 * .osz. Empty state is a clear "drag a .osz here" CTA.
 *
 * The header is sticky-ish (always visible) and contains:
 *   • count of current imports
 *   • file picker button (mirrors the full-page drag-and-drop)
 */
export default function ImportsList({
  selectedId,
  selectedBeatmap,
  selectedDiff,
  onSelect,
  onDiffChange,
  onPickFiles,
  accent = "#ff66aa",
}) {
  const { imports, loading, remove } = useImports();
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);
  const selectedRef = useRef(null);

  function handlePickClick() {
    fileInputRef.current?.click();
  }

  function handleFileInputChange(e) {
    const files = Array.from(e.target.files || []);
    if (files.length && onPickFiles) onPickFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Scroll-to-selected when selection changes from outside (e.g. the
  // Random button) so the chosen card isn't off-screen.
  useEffect(() => {
    if (selectedRef.current && scrollRef.current) {
      selectedRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedId]);

  return (
    <div className="flex flex-col h-full" data-testid="solo-imports-list">
      {/* ── Header (count + picker) ─────────────────────────────── */}
      <div className="flex-shrink-0 mx-6 mr-12 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePickClick}
            data-testid="solo-imports-pick-button"
            className="flex-1 flex items-center justify-center gap-2 h-[36px] rounded-full border border-dashed border-white/15 bg-black/45 backdrop-blur-xl hover:bg-white/[0.05] hover:border-white/40 text-[11px] uppercase tracking-[0.20em] font-semibold text-white/70 hover:text-white transition-colors"
          >
            <Upload size={12} strokeWidth={2.2} />
            Importer un .osz
          </button>
          <span
            className="inline-flex items-center justify-center min-w-[36px] h-[36px] px-3 rounded-full border border-white/10 bg-black/45 backdrop-blur-xl text-[10.5px] uppercase tracking-[0.22em] text-white/50 font-bold tabular-nums"
            data-testid="solo-imports-count"
          >
            {loading ? <Loader2 size={11} className="animate-spin" /> : imports.length}
          </span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".osz,application/octet-stream,application/zip"
          multiple
          onChange={handleFileInputChange}
          className="hidden"
          data-testid="solo-imports-file-input"
        />
      </div>

      {/* ── Scrollable beatmap cards ────────────────────────────── */}
      <div
        ref={scrollRef}
        data-lenis-prevent
        className="flex-1 overflow-y-auto overflow-x-hidden py-2 pl-24 pr-16 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10"
        style={{ perspective: "900px", overscrollBehavior: "contain" }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={20} className="animate-spin text-white/40" />
          </div>
        ) : imports.length === 0 ? (
          <EmptyState accent={accent} onPick={handlePickClick} />
        ) : (
          <AnimatePresence initial={false}>
            {imports.map((bm, idx) => {
              const isSelected = selectedId === bm.id;
              const fullBm =
                isSelected && selectedBeatmap?.id === bm.id ? selectedBeatmap : bm;
              return (
                <motion.div
                  key={bm.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  ref={isSelected ? selectedRef : null}
                  className="py-[3px] relative group/import"
                >
                  <SongCard
                    beatmap={bm}
                    selected={isSelected}
                    onClick={() => onSelect && onSelect(bm)}
                    index={idx}
                  />

                  {/* Delete button — only visible on hover, sits over the
                      card in absolute, doesn't affect layout. */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        window.confirm(
                          `Supprimer « ${bm.title} » \u2014 cette action est irr\u00e9versible.`
                        )
                      ) {
                        remove(bm.id).catch(console.error);
                      }
                    }}
                    title="Supprimer"
                    data-testid="solo-imports-delete"
                    data-import-id={bm.id}
                    className="absolute top-1/2 -translate-y-1/2 right-2 h-7 w-7 rounded-md text-white/35 hover:text-red-400 bg-black/55 hover:bg-red-500/15 border border-white/10 hover:border-red-400/40 backdrop-blur-md opacity-0 group-hover/import:opacity-100 transition-all flex items-center justify-center z-[2]"
                  >
                    <Trash2 size={13} strokeWidth={1.8} />
                  </button>

                  {isSelected && fullBm.difficulties?.length > 0 && (
                    <DiffList
                      beatmap={fullBm}
                      selectedDiff={selectedDiff}
                      onSelect={onDiffChange}
                    />
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function EmptyState({ accent, onPick }) {
  return (
    <div
      className="px-3 py-12 flex flex-col items-center text-center gap-3"
      data-testid="solo-imports-empty"
    >
      <div
        className="h-16 w-16 rounded-2xl flex items-center justify-center border border-dashed"
        style={{ borderColor: `${accent}66`, color: accent }}
      >
        <FileMusic size={26} strokeWidth={1.4} />
      </div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-white/55 font-semibold">
        Aucune beatmap
      </p>
      <p className="text-[11px] text-white/40 leading-relaxed max-w-[260px]">
        Glisse un fichier <span className="font-semibold text-white/70">.osz</span> n'importe où sur la page,
        ou clique ci-dessous pour parcourir tes fichiers.
      </p>
      <button
        type="button"
        onClick={onPick}
        className="mt-1 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/30 px-4 py-1.5 text-[10.5px] uppercase tracking-[0.24em] text-white/70 hover:text-white font-semibold transition-colors"
      >
        <Upload size={11} strokeWidth={2} />
        Parcourir
      </button>
    </div>
  );
}
