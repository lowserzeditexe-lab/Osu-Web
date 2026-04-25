import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import AmbientBackground from "@/components/AmbientBackground";
import BeatmapCard from "@/components/library/BeatmapCard";
import Pagination from "@/components/library/Pagination";
import {
  ModeTabs,
  StatusChips,
  SortSelect,
  MODES,
  STATUSES,
  SORTS,
} from "@/components/library/SearchControls";
import { searchBeatmaps } from "@/lib/api";
import { useLibraryFilters } from "@/contexts/LibraryFiltersContext";

const PAGE_SIZE = 24;

// Default URL params
const DEFAULTS = {
  mode: "osu",
  status: "ranked",
  sort: "relevance", // auto-downgraded to ranked_desc backend-side if no q
};

export default function LibrarySearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { filters } = useLibraryFilters();

  const q      = (searchParams.get("q") || "").trim();
  const mode   = MODES.some((m) => m.key === searchParams.get("mode"))     ? searchParams.get("mode")   : DEFAULTS.mode;
  const status = STATUSES.some((s) => s.key === searchParams.get("status")) ? searchParams.get("status") : DEFAULTS.status;
  const sort   = SORTS.some((s) => s.key === searchParams.get("sort"))     ? searchParams.get("sort")   : DEFAULTS.sort;
  const page   = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  const [state, setState] = useState({
    status: "idle",
    items: [],
    total: 0,
    hasMore: false,
    complete: true,
    idPin: null,
    error: null,
  });

  // Fetch whenever any search criteria change.
  const filtersKey = JSON.stringify(filters);
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, status: "loading", error: null }));
    const offset = (page - 1) * PAGE_SIZE;
    searchBeatmaps({
      q, status, sort, mode,
      genre: filters.genre || undefined,
      language: filters.language || undefined,
      bpm_min: filters.bpm_min || undefined,
      bpm_max: filters.bpm_max || undefined,
      diff_min: filters.diff_min || undefined,
      diff_max: filters.diff_max || undefined,
      limit: PAGE_SIZE,
      offset,
    })
      .then((data) => {
        if (cancelled) return;
        setState({
          status: "ready",
          items: data.items || [],
          total: data.total || 0,
          hasMore: Boolean(data.has_more),
          complete: Boolean(data.total_known_complete),
          idPin: data.id_pin || null,
          error: null,
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({
          status: "error",
          items: [],
          total: 0,
          hasMore: false,
          complete: true,
          idPin: null,
          error: e.message || "Error",
        });
      });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    return () => { cancelled = true; };
  }, [q, status, sort, mode, filtersKey, page]);

  // Reset to page 1 when criteria (but not page) change.
  const resetPageParams = useCallback(
    (mut) => {
      const next = new URLSearchParams(searchParams);
      mut(next);
      next.delete("page");
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  const setPage = useCallback(
    (p) => {
      const next = new URLSearchParams(searchParams);
      if (p === 1) next.delete("page");
      else next.set("page", String(p));
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  const criteriaLabel = useMemo(() => {
    const parts = [];
    if (mode !== DEFAULTS.mode) parts.push(MODES.find((m) => m.key === mode)?.label || mode);
    if (status !== DEFAULTS.status) parts.push(STATUSES.find((s) => s.key === status)?.label || status);
    if (sort !== DEFAULTS.sort) parts.push(SORTS.find((s) => s.key === sort)?.label || sort);
    if (filters.genre) parts.push(filters.genre);
    if (filters.language) parts.push(filters.language);
    return parts;
  }, [mode, status, sort, filters]);

  return (
    <main className="relative min-h-screen px-6 md:px-10 pt-44 pb-20">
      <AmbientBackground />

      <div className="relative w-full max-w-[1320px] mx-auto">
        <Link
          to="/library"
          data-testid="library-search-back"
          className="group inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-white/60 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
          Library
        </Link>

        <div className="mt-6">
          <div className="inline-flex items-center gap-2">
            <span className="h-[6px] w-[6px] rounded-full bg-[#b388ff] shadow-[0_0_12px_#b388ff]" />
            <span className="text-[10px] uppercase tracking-[0.3em] text-white/45">
              Search
            </span>
          </div>
          <h1
            data-testid="library-search-title"
            className="mt-3 text-[36px] md:text-[48px] leading-[0.95] tracking-tight font-semibold text-white"
          >
            {q ? (
              <>
                Results for <span className="text-white/50">“{q}”</span>
              </>
            ) : (
              <>Beatmap <span className="text-white/50">catalogue</span>.</>
            )}
          </h1>
          <p className="mt-2 text-[12px] uppercase tracking-[0.25em] text-white/45 flex items-center gap-1.5 flex-wrap">
            {state.status === "ready" && (
              <span className="text-white/75">
                {state.total}
                {!state.complete && state.hasMore ? "+" : ""} match{state.total === 1 ? "" : "es"}
              </span>
            )}
            {state.status === "loading" && (
              <span className="inline-flex items-center gap-1.5 text-white/55">
                <Loader2 size={10} className="animate-spin" /> Searching
              </span>
            )}
            {criteriaLabel.length > 0 && (
              <>
                <span className="text-white/25">·</span>
                {criteriaLabel.map((lbl, i) => (
                  <span key={i} className="text-white/75">
                    {lbl}{i < criteriaLabel.length - 1 ? " ·" : ""}
                  </span>
                ))}
              </>
            )}
          </p>
        </div>

        {/* Controls row: mode + status chips + sort */}
        <div className="mt-8 flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <ModeTabs value={mode} onChange={(v) => resetPageParams((n) => {
              if (v === DEFAULTS.mode) n.delete("mode"); else n.set("mode", v);
            })} />
            <SortSelect
              value={sort}
              disableRelevance={!q}
              onChange={(v) => resetPageParams((n) => {
                if (v === DEFAULTS.sort) n.delete("sort"); else n.set("sort", v);
              })}
            />
          </div>
          <StatusChips value={status} onChange={(v) => resetPageParams((n) => {
            if (v === DEFAULTS.status) n.delete("status"); else n.set("status", v);
          })} />
        </div>

        {/* ID pin banner */}
        {state.idPin && page === 1 && (
          <div
            data-testid="library-search-id-pin"
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-[#b388ff]/40 bg-[#b388ff]/10 px-3 py-1.5 text-[10.5px] uppercase tracking-[0.25em] text-[#b388ff]/90"
          >
            Direct match · Beatmapset #{state.idPin}
          </div>
        )}

        {/* Results */}
        <div className="mt-8">
          {state.status === "loading" && state.items.length === 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md aspect-[3/4] animate-pulse"
                />
              ))}
            </div>
          )}

          {state.status === "error" && (
            <div
              data-testid="library-search-error"
              className="rounded-2xl border border-red-400/20 bg-red-500/5 backdrop-blur-md p-8 text-center"
            >
              <p className="text-red-200 text-sm">Search failed.</p>
              <p className="mt-2 text-white/40 text-xs">{state.error}</p>
            </div>
          )}

          {state.status === "ready" && state.items.length === 0 && (
            <div
              data-testid="library-search-empty"
              className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-10 text-center text-white/55"
            >
              No beatmaps match your search.
            </div>
          )}

          {state.items.length > 0 && (
            <>
              <div
                data-testid="library-search-grid"
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-4"
              >
                {state.items.map((bm) => (
                  <BeatmapCard key={bm.id} beatmap={bm} />
                ))}
              </div>
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={state.total}
                hasMore={state.hasMore}
                onChange={setPage}
              />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
