import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AmbientBackground from "@/components/AmbientBackground";
import BeatmapCard from "@/components/library/BeatmapCard";
import Pagination from "@/components/library/Pagination";
import { fetchBeatmapsCategory } from "@/lib/api";
import { useLibraryFilters } from "@/contexts/LibraryFiltersContext";

const CATEGORY_META = {
  new:     { title: "Nouvelles",  subtitle: "Newly added",      accent: "#66c6ff" },
  popular: { title: "Populaires", subtitle: "Most played",      accent: "#ff66aa" },
  random:  { title: "Random",     subtitle: "Fresh every visit", accent: "#b388ff" },
};

const PAGE_SIZE = 24;

export default function LibraryCategoryPage() {
  const { category } = useParams();
  const meta = CATEGORY_META[category];
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  const { filters } = useLibraryFilters();
  const filtersKey = JSON.stringify(filters);

  const seed = useMemo(() => {
    if (category !== "random") return undefined;
    try {
      const k = "osuweb_random_seed";
      const cur = sessionStorage.getItem(k);
      if (cur) return cur;
      const s = Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(k, s);
      return s;
    } catch {
      return Math.random().toString(36).slice(2, 10);
    }
  }, [category]);

  const [state, setState] = useState({ status: "loading", items: [], total: 0, error: null });

  useEffect(() => {
    let cancelled = false;
    if (!meta) {
      setState({ status: "error", items: [], total: 0, error: "Unknown category" });
      return () => {};
    }
    setState((s) => ({ ...s, status: "loading", error: null }));
    const offset = (page - 1) * PAGE_SIZE;
    fetchBeatmapsCategory(category, { limit: PAGE_SIZE, offset, seed, ...filters })
      .then((data) => {
        if (cancelled) return;
        setState({ status: "ready", items: data.items || [], total: data.total || 0, error: null });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ status: "error", items: [], total: 0, error: e.message || "Error" });
      });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, page, seed, meta, filtersKey]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("page");
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  function setPage(p) {
    const next = new URLSearchParams(searchParams);
    if (p === 1) next.delete("page");
    else next.set("page", String(p));
    setSearchParams(next);
  }

  return (
    <main className="relative min-h-screen px-6 md:px-10 pt-44 pb-20">
      <AmbientBackground />

      <div className="relative w-full max-w-[1320px] mx-auto">
        <Link
          to="/library"
          data-testid="library-category-back"
          className="group inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-white/60 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
          Library
        </Link>

        <div className="mt-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2">
              <span
                className="h-[6px] w-[6px] rounded-full"
                style={{ background: meta?.accent || "#fff", boxShadow: `0 0 12px ${meta?.accent || "#fff"}` }}
              />
              <span className="text-[10px] uppercase tracking-[0.3em] text-white/45">
                {meta?.subtitle || category}
              </span>
            </div>
            <h1
              data-testid="library-category-title"
              className="mt-3 text-[40px] md:text-[56px] leading-[0.95] tracking-tight font-semibold text-white"
            >
              {meta?.title || category}
            </h1>
          </div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-white/45">
            {state.status === "ready" ? `${state.total} beatmaps` : "—"}
          </div>
        </div>

        <div className="mt-8 md:mt-10">
          {state.status === "loading" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] aspect-[3/4] animate-pulse" />
              ))}
            </div>
          )}
          {state.status === "error" && (
            <div data-testid="library-category-error" className="rounded-2xl border border-red-400/20 bg-red-500/5 p-8 text-center">
              <p className="text-red-200 text-sm">{state.error}</p>
            </div>
          )}
          {state.status === "ready" && state.items.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center text-white/55">
              Aucune beatmap ne correspond à ces filtres.
            </div>
          )}
          {state.status === "ready" && state.items.length > 0 && (
            <>
              <div data-testid="library-category-grid" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-4">
                {state.items.map((bm) => <BeatmapCard key={bm.id} beatmap={bm} />)}
              </div>
              <Pagination page={page} pageSize={PAGE_SIZE} total={state.total} onChange={setPage} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
