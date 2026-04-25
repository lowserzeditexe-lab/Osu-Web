import React, { useCallback, useEffect, useRef, useState } from "react";
import { Search, X, Loader2, FolderOpen, Clock, Music2, Star, LayoutList, ChevronDown } from "lucide-react";
import SongCard from "./SongCard";
import DiffList from "./DiffList";
import ProfileCard from "./ProfileCard";
import { fetchBeatmapsCategory, searchBeatmaps } from "@/lib/api";

const PAGE_SIZE = 50;

const GROUPINGS = [
  { key: "none",       label: "No Grouping",      icon: LayoutList },
  { key: "collection", label: "Collection",        icon: FolderOpen },
  { key: "recent",     label: "Recently Played",   icon: Clock },
  { key: "artist",     label: "By Artist",         icon: Music2 },
  { key: "difficulty", label: "By Difficulty",     icon: Star },
];

const DIFF_RANGES = [
  { key: "easy",     label: "Easy",     min: 0,   max: 2   },
  { key: "normal",   label: "Normal",   min: 2,   max: 3.5 },
  { key: "hard",     label: "Hard",     min: 3.5, max: 5   },
  { key: "insane",   label: "Insane",   min: 5,   max: 6.5 },
  { key: "expert",   label: "Expert",   min: 6.5, max: 8   },
  { key: "expertp",  label: "Expert+",  min: 8,   max: 999 },
];

function difficultyColor(r) {
  if (r < 2)   return "#4fc3f7";
  if (r < 3.5) return "#66e88e";
  if (r < 5)   return "#f5d76e";
  if (r < 6.5) return "#ff8c69";
  if (r < 8)   return "#c084fc";
  return "#ff4ecd";
}

/** Returns an array of { key, label, color?, items[] } */
function groupSongs(songs, grouping, savedIds = []) {
  switch (grouping) {
    case "collection": {
      const saved = songs.filter((bm) => savedIds.includes(bm.id));
      if (saved.length === 0) return [];
      return [{ key: "collection", label: "Collection", items: saved }];
    }
    case "recent":
      return [{ key: "recent", label: "Recently Played", items: songs }];

    case "artist": {
      const map = {};
      songs.forEach((bm) => {
        const letter = bm.artist?.charAt(0)?.toUpperCase() || "#";
        if (!map[letter]) map[letter] = [];
        map[letter].push(bm);
      });
      return Object.keys(map)
        .sort()
        .map((k) => ({ key: k, label: k, items: map[k] }));
    }
    case "difficulty": {
      return DIFF_RANGES.map((r) => ({
        key: r.key,
        label: r.label,
        color: difficultyColor((r.min + r.max) / 2),
        items: songs.filter(
          (bm) => (bm.difficulty ?? 0) >= r.min && (bm.difficulty ?? 0) < r.max
        ),
      })).filter((g) => g.items.length > 0);
    }
    default:
      return [{ key: "all", label: null, items: songs }];
  }
}

export default function SongList({
  selectedId,
  selectedBeatmap,
  selectedDiff,
  onSelect,
  onDiffChange,
  onRandom,
  mods,
  onModToggle,
  accent = "#b388ff",
  suppressAutoSelect = false,
}) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [grouping, setGrouping] = useState("none");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const scrollRef = useRef(null);
  const selectedRef = useRef(null);

  // Saved beatmaps from localStorage for Collection grouping
  const [savedIds, setSavedIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("osu_saved_beatmaps") || "[]").map((b) => b.id);
    } catch { return []; }
  });

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch on debounced query change
  useEffect(() => {
    let cancelled = false;
    setSongs([]);
    setOffset(0);
    setHasMore(true);
    setLoading(true);

    const isSearching = !!debouncedQuery.trim();
    const fetchFn = isSearching
      ? searchBeatmaps({ q: debouncedQuery.trim(), field: "all", limit: PAGE_SIZE, offset: 0 })
      : fetchBeatmapsCategory("popular", { limit: PAGE_SIZE, offset: 0 });

    fetchFn
      .then((data) => {
        if (cancelled) return;
        const items = data.items || [];
        setSongs(items);
        setHasMore(items.length === PAGE_SIZE);
        setLoading(false);
        if (suppressAutoSelect || items.length === 0) return;

        // If actively searching, ALWAYS surface a search match in the detail
        // panel: keep current selection only if it's part of the results,
        // otherwise jump to the first match. When not searching, only
        // auto-select if nothing is selected yet (preserve restored state).
        if (isSearching) {
          const stillThere = selectedId && items.some((b) => b.id === selectedId);
          if (!stillThere) onSelect(items[0]);
        } else if (!selectedId) {
          onSelect(items[0]);
        }
      })
      .catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  // Scroll to selected card
  useEffect(() => {
    if (selectedRef.current && scrollRef.current) {
      selectedRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedId]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  async function loadMore() {
    if (loadingMore || !hasMore || debouncedQuery.trim()) return;
    setLoadingMore(true);
    const newOffset = offset + PAGE_SIZE;
    try {
      const data = await fetchBeatmapsCategory("popular", { limit: PAGE_SIZE, offset: newOffset });
      const items = data.items || [];
      setSongs((prev) => [...prev, ...items]);
      setOffset(newOffset);
      setHasMore(items.length === PAGE_SIZE);
    } finally { setLoadingMore(false); }
  }

  // Random: shuffle the current list
  function handleRandom() {
    setSongs((prev) => [...prev].sort(() => Math.random() - 0.5));
  }

  const activeGrouping = GROUPINGS.find((g) => g.key === grouping);
  const grouped = groupSongs(songs, grouping, savedIds);

  return (
    <div className="flex flex-col h-full">
      {/* Toute la colonne (header + cards + profile) : même largeur, alignée à droite du panneau */}
      <div className="ml-auto w-[440px] xl:w-[500px] 2xl:w-[560px] flex flex-col h-full">

      {/* ── Header — la search bar et le grouping ont la MÊME largeur que la
          ProfileCard (ml-6 / mr-12), pour un alignement vertical net entre le
          haut et le bas de la colonne. */}
      <div className="flex-shrink-0 mx-6 mr-12 pt-5 pb-3 space-y-2">

        {/* Search */}
        <div
          className="relative flex items-center rounded-full border border-white/10 bg-black/45 backdrop-blur-xl focus-within:border-white/25 transition-colors"
          data-testid="solo-search-wrapper"
        >
          <Search size={14} strokeWidth={1.6} className="ml-3.5 text-white/45 flex-shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une map…"
            className="flex-1 bg-transparent px-4 py-2 text-[12.5px] text-white placeholder-white/30 outline-none"
            data-testid="solo-search-input"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="mr-2.5 text-white/40 hover:text-white transition-colors">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Grouping selector */}
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
                      onClick={() => { setGrouping(g.key); setDropdownOpen(false); }}
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

      {/* ── Song list ── */}
      <div
        ref={scrollRef}
        data-lenis-prevent
        className="flex-1 overflow-y-auto overflow-x-hidden py-2 pl-16 pr-12 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10"
        style={{ perspective: "900px", overscrollBehavior: "contain" }}
      >
        <div>
        {loading && (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={20} className="animate-spin text-white/40" />
          </div>
        )}

        {/* Empty collection state */}
        {!loading && grouping === "collection" && grouped.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-white/35">
            <FolderOpen size={28} strokeWidth={1.2} />
            <p className="text-[11px] uppercase tracking-[0.22em]">Aucune map sauvegardée</p>
            <p className="text-[10px] text-white/25 text-center max-w-[180px]">
              Sauvegarde des maps depuis la bibliothèque pour les voir ici.
            </p>
          </div>
        )}

        {!loading && grouping !== "collection" && songs.length === 0 && (
          <div className="flex items-center justify-center h-40 text-[12px] text-white/35">
            Aucune map trouvée
          </div>
        )}

        {/* Grouped sections */}
        {!loading && grouped.map((group) => (
          <div key={group.key}>
            {/* Group header */}
            {group.label && (
              <div className="flex items-center gap-2 px-1 py-2 mt-2 mb-0.5">
                {group.color && (
                  <span
                    className="h-2 w-2 rounded-full flex-shrink-0"
                    style={{ background: group.color, boxShadow: `0 0 6px ${group.color}` }}
                  />
                )}
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
              const fullBm = isSelected && selectedBeatmap?.id === bm.id ? selectedBeatmap : bm;
              return (
                <div key={bm.id} ref={isSelected ? selectedRef : null} className="py-[3px]">
                  <SongCard
                    beatmap={bm}
                    selected={isSelected}
                    onClick={() => onSelect(bm)}
                    index={idx}
                  />
                  {isSelected && fullBm.difficulties?.length > 0 && (
                    <DiffList beatmap={fullBm} selectedDiff={selectedDiff} onSelect={onDiffChange} />
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {/* Load more */}
        {!loading && hasMore && songs.length > 0 && grouping !== "collection" && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="w-full py-4 text-[10.5px] uppercase tracking-[0.24em] text-white/40 hover:text-white/80 transition-colors flex items-center justify-center gap-2"
            data-testid="solo-load-more"
          >
            {loadingMore ? <Loader2 size={13} className="animate-spin" /> : null}
            {loadingMore ? "Chargement…" : "Charger plus"}
          </button>
        )}
        </div>
      </div>

      {/* Profile card */}
      <ProfileCard
        accent={accent}
        beatmap={selectedBeatmap}
        selectedDiff={selectedDiff}
        mods={mods}
        onModToggle={onModToggle}
        onRandom={handleRandom}
      />

      </div>{/* fin colonne ml-auto */}
    </div>
  );
}
