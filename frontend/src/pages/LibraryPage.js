import React, { useEffect, useMemo, useState } from "react";
import AmbientBackground from "@/components/AmbientBackground";
import CategorySection from "@/components/library/CategorySection";
import { fetchBeatmapsCategory } from "@/lib/api";
import { useLibraryFilters } from "@/contexts/LibraryFiltersContext";

const SECTIONS = [
  { slug: "new",     title: "Nouvelles",  subtitle: "Newly added",    accent: "#66c6ff" },
  { slug: "popular", title: "Populaires", subtitle: "Most played",    accent: "#ff66aa" },
  { slug: "random",  title: "Random",     subtitle: "Fresh every visit", accent: "#b388ff" },
];

function useCategory(slug, limit = 6, seed, filters = {}) {
  const [state, setState] = useState({ status: "loading", items: [], error: null });
  const filtersKey = JSON.stringify(filters);

  async function load() {
    setState((s) => ({ ...s, status: "loading", error: null }));
    try {
      const data = await fetchBeatmapsCategory(slug, { limit, offset: 0, seed, ...filters });
      setState({ status: "ready", items: data.items || [], error: null });
    } catch (e) {
      setState({ status: "error", items: [], error: e.message || "Error" });
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, limit, seed, filtersKey]);

  return { ...state, reload: load };
}

export default function LibraryPage() {
  const seed = useMemo(() => {
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
  }, []);

  const { filters } = useLibraryFilters();

  const neu = useCategory("new",     6, undefined, filters);
  const pop = useCategory("popular", 6, undefined, filters);
  const rnd = useCategory("random",  6, seed,      filters);

  return (
    <main className="relative min-h-screen px-6 md:px-10 pt-44 pb-20">
      <AmbientBackground />

      <div className="relative w-full max-w-[1320px] mx-auto">
        {/* Header */}
        <div>
          <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] backdrop-blur-md px-3 py-1.5">
            <span className="h-[6px] w-[6px] rounded-full bg-[#b388ff] shadow-[0_0_12px_#b388ff]" />
            <span className="text-[10px] uppercase tracking-[0.32em] text-white/55">03 / library</span>
          </div>
          <h1 className="mt-5 text-[44px] md:text-[64px] leading-[0.95] tracking-tight font-semibold text-white">
            Beatmap <span className="text-white/35">library</span>.
          </h1>
          <p className="mt-3 max-w-[54ch] text-[14px] md:text-[15px] text-white/55">
            Browse the catalogue. Search by title, artist, mapper or id — explore nouvelles, populaires, or random picks.
          </p>
        </div>

        {/* Sections */}
        <div className="mt-14 md:mt-16 space-y-14 md:space-y-20">
          <CategorySection
            slug="new"     title={SECTIONS[0].title} subtitle={SECTIONS[0].subtitle}
            accent={SECTIONS[0].accent} items={neu.items} status={neu.status}
            error={neu.error} onRetry={neu.reload}
          />
          <CategorySection
            slug="popular" title={SECTIONS[1].title} subtitle={SECTIONS[1].subtitle}
            accent={SECTIONS[1].accent} items={pop.items} status={pop.status}
            error={pop.error} onRetry={pop.reload}
          />
          <CategorySection
            slug="random"  title={SECTIONS[2].title} subtitle={SECTIONS[2].subtitle}
            accent={SECTIONS[2].accent} items={rnd.items} status={rnd.status}
            error={rnd.error} onRetry={rnd.reload}
          />
        </div>
      </div>
    </main>
  );
}
