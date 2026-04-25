import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import BeatmapCard from "@/components/library/BeatmapCard";

export default function CategorySection({
  slug,
  title,
  subtitle,
  items,
  status,
  error,
  onRetry,
  accent,
}) {
  return (
    <section
      className="relative"
      data-testid={`library-section-${slug}`}
      aria-label={title}
    >
      <header className="flex items-end justify-between mb-5 md:mb-6">
        <div>
          <div className="inline-flex items-center gap-2">
            <span
              className="h-[6px] w-[6px] rounded-full"
              style={{ background: accent, boxShadow: `0 0 12px ${accent}` }}
            />
            <span className="text-[10px] uppercase tracking-[0.3em] text-white/45">
              {subtitle}
            </span>
          </div>
          <h2 className="mt-2 text-[26px] md:text-[32px] font-semibold text-white tracking-tight">
            {title}
          </h2>
        </div>
        <Link
          to={`/library/c/${slug}`}
          data-testid={`library-section-${slug}-seemore`}
          className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-md px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-white/75 hover:text-white hover:border-white/30 transition-colors"
        >
          Voir plus
          <ArrowRight
            size={14}
            strokeWidth={1.6}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      </header>

      {status === "loading" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md aspect-[3/4] animate-pulse"
            />
          ))}
        </div>
      )}

      {status === "error" && (
        <div
          data-testid={`library-section-${slug}-error`}
          className="rounded-2xl border border-red-400/20 bg-red-500/5 backdrop-blur-md p-6 text-center"
        >
          <p className="text-red-200 text-[13px]">Couldn’t load this section.</p>
          <p className="mt-2 text-white/40 text-[11px]">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.04] px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-white/85 hover:border-white/50 hover:text-white transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {status === "ready" && items.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-8 text-center text-white/50 text-[13px]">
          No beatmaps yet.
        </div>
      )}

      {status === "ready" && items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          {items.map((bm) => (
            <BeatmapCard key={bm.id} beatmap={bm} compact />
          ))}
        </div>
      )}
    </section>
  );
}
