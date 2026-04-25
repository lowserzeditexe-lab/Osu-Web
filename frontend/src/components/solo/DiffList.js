import React from "react";
import { Star } from "lucide-react";
import { difficultyColor, difficultyLabel, formatDuration } from "@/lib/format";

/**
 * Expanded list of difficulties shown beneath the selected SongCard.
 * Uses the EXACT same parallelogram card format as SongCard, but each
 * row represents a difficulty variant of the same beatmapset.
 * The actively selected diff slides further to the left and glows with
 * its difficulty color.
 */
export default function DiffList({ beatmap, selectedDiff, onSelect }) {
  const diffs = beatmap?.difficulties;
  if (!diffs || diffs.length === 0) return null;

  const sorted = [...diffs].sort(
    (a, b) => a.difficulty_rating - b.difficulty_rating
  );
  const cover = beatmap.cover_card_url || beatmap.cover_url || "";

  return (
    <div className="mt-1.5 space-y-[3px]" data-testid="solo-diff-list">
      {sorted.map((diff) => {
        const color = difficultyColor(diff.difficulty_rating);
        const active = selectedDiff?.id === diff.id;

        return (
          <button
            key={diff.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(diff);
            }}
            data-testid={`solo-diff-row-${diff.id}`}
            aria-pressed={active}
            className="group relative block w-full text-left outline-none
              transition-[transform,filter] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              transform: active
                ? "translate3d(-52px,0,0) scale(1.025)"
                : "translate3d(-18px,0,0) scale(1)",
            }}
          >
            {/* Outer parallelogram */}
            <div
              className={`relative overflow-hidden rounded-[10px] border transition-colors duration-300
                ${active ? "bg-black/55" : "bg-black/42 hover:bg-black/55 border-white/10 hover:border-white/25"}
              `}
              style={{
                transform: "skewX(-6deg)",
                borderColor: active ? color : undefined,
                boxShadow: active
                  ? `0 18px 40px -18px ${color}aa, 0 0 0 1px ${color}66, inset 0 0 0 1px rgba(255,255,255,0.05)`
                  : "0 10px 28px -18px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(255,255,255,0.04)",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
              }}
            >
              {/* Cover background */}
              {cover && (
                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url(${cover})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    transform: "skewX(6deg) scale(1.25)",
                    opacity: active ? 0.55 : 0.25,
                    transition: "opacity 300ms ease",
                    filter: active
                      ? "saturate(1.1) brightness(0.85)"
                      : "saturate(1.0) brightness(0.7)",
                  }}
                />
              )}

              {/* Dark gradient */}
              <div
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.35) 100%)",
                }}
              />

              {/* Left accent stripe when active */}
              {active && (
                <div
                  aria-hidden
                  className="absolute left-0 top-0 bottom-0 w-[4px]"
                  style={{
                    background: color,
                    boxShadow: `0 0 14px ${color}, 0 0 3px ${color}`,
                  }}
                />
              )}

              {/* Inner counter-skewed content — extra pr compensates for the
                  parallelogram skew clipping the right edge. Padding/gap mirror
                  SongCard so the visual rhythm stays consistent. */}
              <div
                className="relative flex items-center gap-3.5 pl-4 pr-8 py-3"
                style={{ transform: "skewX(6deg)" }}
              >
                {/* Thumbnail (mirrors SongCard) */}
                <div
                  className="relative flex-shrink-0 h-[52px] w-[52px] rounded-md overflow-hidden bg-white/10 border border-white/10 flex items-center justify-center"
                  style={
                    active
                      ? {
                          borderColor: `${color}88`,
                          boxShadow: `0 0 14px ${color}55`,
                        }
                      : {}
                  }
                >
                  {cover && (
                    <img
                      src={cover}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover opacity-70"
                    />
                  )}
                  <div
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.6) 100%)",
                    }}
                  />
                  <Star
                    size={20}
                    fill={color}
                    stroke={color}
                    strokeWidth={0}
                    className="relative z-[1]"
                    style={{ filter: `drop-shadow(0 0 6px ${color}aa)` }}
                  />
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-[13.5px] font-semibold truncate leading-tight
                      ${active ? "text-white" : "text-white/90"}`}
                  >
                    {diff.version}
                  </p>
                  <p className="text-[11px] text-white/55 truncate mt-0.5">
                    {difficultyLabel(diff.difficulty_rating)}
                    {diff.mode && diff.mode !== "osu" ? ` · ${diff.mode}` : ""}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-[10px]">
                    <span
                      className="inline-flex items-center gap-1 font-semibold"
                      style={{ color }}
                    >
                      <Star size={9} fill={color} strokeWidth={0} />
                      {diff.difficulty_rating.toFixed(2)}
                    </span>
                    {Number.isFinite(beatmap.bpm) && (
                      <>
                        <span className="h-[3px] w-[3px] rounded-full bg-white/25" />
                        <span className="text-white/45">{beatmap.bpm} BPM</span>
                      </>
                    )}
                    {Number.isFinite(beatmap.duration_sec) && (
                      <>
                        <span className="h-[3px] w-[3px] rounded-full bg-white/25" />
                        <span className="text-white/45">
                          {formatDuration(beatmap.duration_sec)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
