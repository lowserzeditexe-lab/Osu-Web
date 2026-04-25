import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { Search, ChevronDown, X, SlidersHorizontal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLibraryFilters, EMPTY_FILTERS } from "@/contexts/LibraryFiltersContext";

const GENRES = [
  "Video Game", "Anime", "Rock", "Pop", "Other", "Novelty",
  "Hip Hop", "Electronic", "Metal", "Classical", "Folk", "Jazz",
];

const LANGUAGES = [
  "English", "Japanese", "Chinese", "Instrumental", "Korean",
  "French", "German", "Swedish", "Spanish", "Italian", "Russian", "Polish",
];

function NativeSelect({ value, onChange, options, placeholder }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-[13px] text-white appearance-none focus:outline-none focus:border-white/25 transition-colors cursor-pointer"
      >
        <option value="" className="bg-black text-white/60">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o} className="bg-[#111] text-white">{o}</option>
        ))}
      </select>
      <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
    </div>
  );
}

function NumInput({ value, onChange, placeholder, step = 1 }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      step={step}
      min={0}
      className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-[13px] text-white placeholder-white/25 focus:outline-none focus:border-white/25 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}

/**
 * osu!-style single-field search bar.
 * - No more "field" selector: query searches across title/artist/mapper/tags.
 * - Pure-digit query auto-pins the matching beatmapset (via backend).
 * - Advanced filters (genre, language, bpm, difficulty) in the expandable panel.
 * - Submits to /library/search with q (status/sort/mode live on the search page itself).
 */
export default function SearchBar({
  initialQuery = "",
  autoFocus = false,
  onSubmit,
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();

  const [q, setQ] = useState(initialQuery);
  const [filterOpen, setFilterOpen] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const { filters, setFilters } = useLibraryFilters();

  // Sync q from URL on search page
  useEffect(() => {
    if (pathname === "/library/search") {
      setQ(searchParams.get("q") || "");
    }
  }, [pathname, searchParams]);

  useEffect(() => { setQ(initialQuery); }, [initialQuery]);

  useEffect(() => {
    if (autoFocus && inputRef.current) inputRef.current.focus();
  }, [autoFocus]);

  useEffect(() => {
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function submit(e) {
    if (e) e.preventDefault();
    const trimmed = (q || "").trim();
    if (onSubmit) { onSubmit({ q: trimmed }); return; }
    // Even with empty query, if we have filters / non-default search criteria,
    // route to the search page so they can see results.
    const hasFilters = Object.values(filters).some((v) => v && v !== "");
    if (!trimmed && !hasFilters) { navigate("/library"); return; }
    const params = new URLSearchParams();
    if (trimmed) params.set("q", trimmed);
    navigate(`/library/search${params.toString() ? "?" + params.toString() : ""}`);
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  function clearFilters() {
    setFilters({ ...EMPTY_FILTERS });
  }

  // Suggest ID lookup hint if query is all digits
  const isIdQuery = /^\d{3,}$/.test(q.trim());

  return (
    <div ref={rootRef} className="relative w-full">
      <form
        onSubmit={submit}
        data-testid="library-searchbar"
        className="relative flex items-stretch w-full rounded-2xl border border-white/10 bg-white/[0.035] backdrop-blur-xl focus-within:border-white/20 transition-colors"
      >
        {/* Search icon */}
        <div className="flex items-center pl-4 pr-2 text-white/55">
          <Search size={18} strokeWidth={1.6} />
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          data-testid="library-search-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type artist, title, mapper, tags or beatmap ID…"
          type="text"
          className="flex-1 bg-transparent outline-none text-white placeholder-white/30 text-[15px] py-[14px] pr-2"
        />

        {/* ID hint pill */}
        {isIdQuery && (
          <span
            data-testid="library-search-id-hint"
            className="hidden md:inline-flex items-center gap-1 self-center mr-2 rounded-full border border-[#b388ff]/40 bg-[#b388ff]/10 px-2.5 py-[3px] text-[10px] uppercase tracking-[0.22em] text-[#b388ff]/90 whitespace-nowrap"
          >
            ID #{q.trim()}
          </span>
        )}

        {/* Clear */}
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            data-testid="library-search-clear"
            className="flex items-center justify-center px-3 text-white/50 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        )}

        {/* Filter toggle */}
        <div className="flex items-center pr-1.5">
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            data-testid="library-search-filter-toggle"
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] uppercase tracking-[0.2em] transition-colors ${
              filterOpen || activeFilterCount > 0
                ? "border-[#b388ff]/60 bg-[#b388ff]/10 text-[#b388ff]"
                : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07] text-white/65 hover:text-white"
            }`}
          >
            <SlidersHorizontal size={13} strokeWidth={1.6} />
            <span className="hidden sm:inline">Filtres</span>
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-[#b388ff] text-black text-[9px] font-bold">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown
              size={12}
              strokeWidth={1.6}
              className={`transition-transform ${filterOpen ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {/* Search button */}
        <button
          type="submit"
          data-testid="library-search-submit"
          className="m-1.5 ml-0 rounded-xl bg-white text-black text-[12px] uppercase tracking-[0.22em] font-semibold px-5 hover:bg-white/90 transition-colors"
        >
          Search
        </button>
      </form>

      {/* Filter panel */}
      <AnimatePresence>
        {filterOpen && (
          <motion.div
            key="filter-panel"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-full left-0 right-0 mt-2 z-[60] rounded-2xl border border-white/10 bg-[#070707]/97 backdrop-blur-2xl p-5 shadow-2xl space-y-4"
            data-testid="library-search-filter-panel"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-[0.3em] text-white/40">Filtres avancés</span>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1.5 text-[11px] text-white/45 hover:text-white transition-colors"
                >
                  <X size={12} /> Reset
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/35 mb-2">Genre</p>
                <NativeSelect
                  value={filters.genre}
                  onChange={(v) => setFilters({ ...filters, genre: v })}
                  options={GENRES}
                  placeholder="Tous"
                />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/35 mb-2">Langue</p>
                <NativeSelect
                  value={filters.language}
                  onChange={(v) => setFilters({ ...filters, language: v })}
                  options={LANGUAGES}
                  placeholder="Toutes"
                />
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-white/35 mb-2">Difficulté ★</p>
              <div className="flex gap-2">
                <NumInput value={filters.diff_min} onChange={(v) => setFilters({ ...filters, diff_min: v })} placeholder="Min" step={0.5} />
                <NumInput value={filters.diff_max} onChange={(v) => setFilters({ ...filters, diff_max: v })} placeholder="Max" step={0.5} />
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-white/35 mb-2">BPM</p>
              <div className="flex gap-2">
                <NumInput value={filters.bpm_min} onChange={(v) => setFilters({ ...filters, bpm_min: v })} placeholder="Min" />
                <NumInput value={filters.bpm_max} onChange={(v) => setFilters({ ...filters, bpm_max: v })} placeholder="Max" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
