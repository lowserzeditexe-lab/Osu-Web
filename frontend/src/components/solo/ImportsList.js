import React, { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileMusic, Trash2, Upload, Music2 } from "lucide-react";
import { useImports } from "@/contexts/ImportsContext";

function formatBytes(n) {
  if (!n) return "—";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

/**
 * Right-column list of the current user's imported beatmaps. Replaces the
 * removed OSU-API SongList. Empty state is a clear "drag a .osz here"
 * call-to-action with an alternative "browse files" button.
 */
export default function ImportsList({
  selectedId,
  onSelect,
  onPickFiles,
  accent = "#ff66aa",
}) {
  const { imports, loading, remove } = useImports();
  const fileInputRef = useRef(null);

  function handlePickClick() {
    fileInputRef.current?.click();
  }

  function handleFileInputChange(e) {
    const files = Array.from(e.target.files || []);
    if (files.length && onPickFiles) onPickFiles(files);
    // Reset so picking the same file twice still triggers change.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div
      className="flex h-full flex-col rounded-2xl border border-white/10 bg-black/55 backdrop-blur-xl overflow-hidden"
      data-testid="solo-imports-list"
    >
      {/* Header + drop CTA */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Music2 size={14} strokeWidth={2.2} className="text-white/60" />
            <span className="text-[11px] uppercase tracking-[0.22em] text-white/55 font-bold">
              Mes beatmaps
            </span>
          </div>
          <span className="text-[10px] text-white/40 tabular-nums">
            {loading ? "…" : imports.length}
          </span>
        </div>

        <button
          type="button"
          onClick={handlePickClick}
          data-testid="solo-imports-pick-button"
          className="w-full flex items-center justify-center gap-2 h-[36px] rounded-xl border border-dashed border-white/20 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/40 text-[11px] uppercase tracking-[0.20em] font-semibold text-white/65 hover:text-white transition-colors"
        >
          <Upload size={12} strokeWidth={2.2} />
          Importer un .osz
        </button>
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

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto py-2 px-2" data-lenis-prevent>
        {loading ? (
          <div className="py-8 text-center text-[11px] uppercase tracking-[0.2em] text-white/35">
            Chargement…
          </div>
        ) : imports.length === 0 ? (
          <EmptyState accent={accent} />
        ) : (
          <AnimatePresence initial={false}>
            {imports.map((bm) => {
              const isSelected = bm.id === selectedId;
              return (
                <motion.button
                  key={bm.id}
                  type="button"
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  onClick={() => onSelect && onSelect(bm)}
                  data-testid="solo-imports-item"
                  data-import-id={bm.id}
                  className={`group w-full flex items-center gap-3 rounded-xl px-2.5 py-2 mb-1 text-left transition-colors ${
                    isSelected
                      ? "bg-white/[0.10] border border-white/15"
                      : "hover:bg-white/[0.04] border border-transparent"
                  }`}
                  style={isSelected ? { boxShadow: `inset 0 0 0 1px ${accent}55` } : {}}
                >
                  {/* Cover thumb */}
                  <div className="flex-shrink-0 h-[44px] w-[44px] rounded-lg overflow-hidden bg-white/[0.05] border border-white/[0.08]">
                    {bm.cover_card_url ? (
                      <img
                        src={`${process.env.REACT_APP_BACKEND_URL || ""}${bm.cover_card_url}`}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/25">
                        <FileMusic size={18} strokeWidth={1.4} />
                      </div>
                    )}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-bold text-white truncate leading-tight">
                      {bm.title || bm.original_filename}
                    </p>
                    <p className="text-[10.5px] text-white/55 truncate mt-0.5">
                      {bm.artist || "unknown"}
                      {bm.creator ? <span className="text-white/35"> · {bm.creator}</span> : null}
                    </p>
                    <p className="text-[9.5px] text-white/35 mt-0.5 tabular-nums">
                      {bm.difficulties?.length || 0} diff·{formatBytes(bm.osz_size_bytes)}
                    </p>
                  </div>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Supprimer « ${bm.title} » \u2014 cette action est irr\u00e9versible.`)) {
                        remove(bm.id).catch(console.error);
                      }
                    }}
                    title="Supprimer"
                    data-testid="solo-imports-delete"
                    className="flex-shrink-0 h-7 w-7 rounded-md text-white/30 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    <Trash2 size={13} strokeWidth={1.8} />
                  </button>
                </motion.button>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function EmptyState({ accent }) {
  return (
    <div className="px-3 py-10 flex flex-col items-center text-center gap-3" data-testid="solo-imports-empty">
      <div
        className="h-14 w-14 rounded-xl flex items-center justify-center border border-dashed"
        style={{ borderColor: `${accent}66`, color: accent }}
      >
        <FileMusic size={22} strokeWidth={1.5} />
      </div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-white/55 font-semibold">
        Aucune beatmap
      </p>
      <p className="text-[10.5px] text-white/40 leading-relaxed max-w-[230px]">
        Glisse un fichier <span className="font-semibold text-white/70">.osz</span> ici, ou clique « Importer un .osz » au dessus.
      </p>
    </div>
  );
}
