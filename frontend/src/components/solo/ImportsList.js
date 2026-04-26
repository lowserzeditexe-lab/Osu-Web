import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileMusic,
  Trash2,
  Loader2,
  Search,
  X,
  LayoutList,
  Music2,
  User,
  ChevronDown,
} from "lucide-react";
import SongCard from "./SongCard";
import DiffList from "./DiffList";
import { useImports } from "@/contexts/ImportsContext";

const GROUPINGS = [
  { key: "none",     label: "No Grouping", icon: LayoutList },
  { key: "artist",   label: "By Artist",   icon: Music2 },
  { key: "mapper",   label: "By Mapper",   icon: User },
];

function groupImports(items, grouping) {
  switch (grouping) {
    case "artist": {
      const map = {};
      items.forEach((bm) => {
        const letter = (bm.artist || "?").charAt(0).toUpperCase() || "#";
        (map[letter] = map[letter] || []).push(bm);
      });
      return Object.keys(map)
        .sort()
        .map((k) => ({ key: k, label: k, items: map[k] }));
    }
    case "mapper": {
      const map = {};
      items.forEach((bm) => {
        const m = bm.mapper || bm.creator || "—";
        (map[m] = map[m] || []).push(bm);
      });
      return Object.keys(map)
        .sort((a, b) => a.localeCompare(b))
        .map((k) => ({ key: k, label: k, items: map[k] }));
    }
    default:
      return [{ key: "all", label: null, items }];
  }
}

/**
 * Right-column list of the user's imported beatmaps. Mirrors the legacy
 * SongList: search bar (top) + grouping selector + scrollable parallelogram
 * SongCards (with a DiffList expansion for the selected card). New imports
 * arrive via the full-page drag-and-drop overlay handled in SoloPage.
 */
export default function ImportsList({
  selectedId,
  selectedBeatmap,
  selectedDiff,
  onSelect,
  onDiffChange,
  accent = "#ff66aa",
}) {
  const { imports, loading, remove } = useImports();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [grouping, setGrouping] = useState("none");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const scrollRef = useRef(null);
  const selectedRef = useRef(null);

  // Debounce search 250ms.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Outside-click closes the grouping dropdown.
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  // Search filter on title / artist / mapper / diff version.
  const filtered = useMemo(() => {
    if (!debouncedQuery) return imports;
    return imports.filter((bm) => {
      const hay = [
        bm.title,
        bm.title_unicode,
        bm.artist,
        bm.artist_unicode,
        bm.mapper,
        bm.creator,
        ...(Array.isArray(bm.tags) ? bm.tags : []),
        ...(bm.difficulties || []).map((d) => d.version),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(debouncedQuery);
    });
  }, [imports, debouncedQuery]);

  const grouped = useMemo(
    () => groupImports(filtered, debouncedQuery ? "none" : grouping),
    [filtered, grouping, debouncedQuery]
  );

  const activeGrouping = GROUPINGS.find((g) => g.key === grouping);

  // Scroll the selected card into view when selection changes externally.
  useEffect(() => {
    if (selectedRef.current && scrollRef.current) {
      selectedRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedId]);

  return (
    <div className="flex flex-col h-full" data-testid="solo-imports-list">
      {/* ── Header : search + grouping (mêmes marges que les cards / la
          ProfileCard ci-dessous, comme l'ancien SongList) ─────────── */}
      <div className="flex-shrink-0 mx-6 mr-12 pt-5 pb-3 space-y-2">
        <div
          className="relative flex items-center rounded-full border border-white/10 bg-black/45 backdrop-blur-xl focus-within:border-white/25 transition-colors"
          data-testid="solo-search-wrapper"
        >
          <Search size={14} strokeWidth={1.6} className="ml-3.5 text-white/45 flex-shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher dans tes maps…"
            className="flex-1 bg-transparent px-4 py-2 text-[12.5px] text-white placeholder-white/30 outline-none"
            data-testid="solo-search-input"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mr-2.5 text-white/40 hover:text-white transition-colors"
              data-testid="solo-search-clear"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {!debouncedQuery && (
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-3.5 py-2 rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl text-white/65 hover:text-white hover:border-white/20 transition-all text-[11px]"
              data-testid="solo-grouping-toggle"
            >
              {activeGrouping && <activeGrouping.icon size={13} strokeWidth={1.7} />}
              <span className="flex-1 text-left font-semibold uppercase tracking-[0.16em]">
                {activeGrouping?.label || "No Grouping"}
              </span>
              <span className="text-white/35 text-[10px] tabular-nums">
                {loading ? "…" : imports.length}
              </span>
              <ChevronDown
                size={13}
                strokeWidth={2}
                className={`transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`}
              />
            </button>
            {dropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1.5 z-30 rounded-xl border border-white/10 bg-black/85 backdrop-blur-xl overflow-hidden shadow-2xl">
                {GROUPINGS.map((g) => {
                  const Icon = g.icon;
                  const active = grouping === g.key;
                  return (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => {
                        setGrouping(g.key);
                        setDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                        active
                          ? "text-white bg-white/[0.08]"
                          : "text-white/55 hover:text-white hover:bg-white/[0.05]"
                      }`}
                      data-testid={`solo-grouping-${g.key}`}
                    >
                      <Icon size={13} strokeWidth={1.7} />
                      {g.label}
                      {active && (
                        <span
                          className="ml-auto h-1.5 w-1.5 rounded-full"
                          style={{ background: accent, boxShadow: `0 0 6px ${accent}` }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Scrollable list ───────────────────────────────────── */}
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
          <EmptyState accent={accent} />
        ) : filtered.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-40 gap-2 text-white/35"
            data-testid="solo-imports-no-results"
          >
            <Search size={22} strokeWidth={1.4} />
            <p className="text-[11px] uppercase tracking-[0.22em]">Aucun résultat</p>
            <p className="text-[10px] text-white/25 text-center max-w-[200px]">
              Aucune map n'a matché « {query} ».
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {grouped.map((group) => (
              <div key={group.key}>
                {group.label && (
                  <div className="flex items-center gap-2 px-1 py-2 mt-2 mb-0.5">
                    <span className="text-[9.5px] uppercase tracking-[0.28em] text-white/35 font-semibold">
                      {group.label}
                    </span>
                    <span className="text-[9px] text-white/20 ml-auto">
                      {group.items.length}
                    </span>
                  </div>
                )}
                {group.items.map((bm, idx) => {
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
              </div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function EmptyState({ accent }) {
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
        Glisse un fichier <span className="font-semibold text-white/70">.osz</span> n'importe où sur la page
        pour l'importer dans ta collection.
      </p>
    </div>
  );
}
