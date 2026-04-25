import React from "react";
import { Star } from "lucide-react";
import { formatDuration, difficultyColor } from "@/lib/format";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";

/**
 * Parallelogram-shaped song card inspired by osu!lazer.
 * Outer wrapper is skewed (-6deg), inner content is counter-skewed (+6deg)
 * so text stays upright. Selected card slides slightly to the left and
 * expands, using the accent color for its border glow.
 */
export default function SongCard({ beatmap, selected, onClick, index = 0 }) {
  const color = difficultyColor(beatmap.difficulty);
  const { currentBeatmap, isPlaying } = useAudioPlayer();
  const isPreviewPlaying =
    currentBeatmap?.id === beatmap.id && isPlaying;

  const cover =
    beatmap.cover_card_url || beatmap.cover_url || "";

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`solo-song-card-${beatmap.id}`}
      aria-pressed={selected}
      className={`group relative block w-full text-left outline-none
        transition-[transform,filter] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]
        ${selected ? "z-10" : "z-0"}
      `}
      style={{
        transform: selected
          ? "translate3d(-34px,0,0) scale(1.035)"
          : "translate3d(0,0,0) scale(1)",
      }}
    >
      {/* Outer parallelogram (skewed) */}
      <div
        className={`relative overflow-hidden rounded-[10px] border transition-colors duration-300
          ${
            selected
              ? "bg-black/55"
              : "bg-black/40 hover:bg-black/55 border-white/10 hover:border-white/25"
          }
        `}
        style={{
          transform: "skewX(-6deg)",
          borderColor: selected ? color : undefined,
          boxShadow: selected
            ? `0 18px 40px -18px ${color}aa, 0 0 0 1px ${color}66, inset 0 0 0 1px rgba(255,255,255,0.05)`
            : "0 10px 28px -18px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(255,255,255,0.04)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
      >
        {/* Cover background layer (also skewed with parent, offset for natural look) */}
        {cover && (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${cover})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              // counter-skew so cover doesn't look stretched
              transform: "skewX(6deg) scale(1.25)",
              opacity: selected ? 0.55 : 0.28,
              transition: "opacity 300ms ease",
              filter: selected
                ? "saturate(1.1) brightness(0.85)"
                : "saturate(1.0) brightness(0.7)",
            }}
          />
        )}

        {/* Dark gradient for readability */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(90deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.35) 100%)",
          }}
        />

        {/* Left accent stripe (only when selected) */}
        {selected && (
          <div
            aria-hidden
            className="absolute left-0 top-0 bottom-0 w-[4px]"
            style={{
              background: color,
              boxShadow: `0 0 14px ${color}, 0 0 3px ${color}`,
            }}
          />
        )}

        {/* Inner counter-skewed content — extra pr-6 compensates for skew clipping */}
        <div
          className="relative flex items-center gap-3.5 pl-4 pr-8 py-2.5"
          style={{ transform: "skewX(6deg)" }}
        >
          {/* Thumbnail */}
          <div
            className="relative flex-shrink-0 h-[52px] w-[52px] rounded-md overflow-hidden bg-white/10 border border-white/10"
            style={
              selected
                ? { borderColor: `${color}88`, boxShadow: `0 0 14px ${color}55` }
                : {}
            }
          >
            {cover && (
              <img
                src={cover}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover"
              />
            )}
            {isPreviewPlaying && (
              <div
                className="absolute inset-0 flex items-end justify-center gap-[2px] pb-1.5 bg-black/55"
              >
                {/* Tiny equalizer bars */}
                <span
                  className="w-[3px] rounded-sm animate-[solo-bar_0.9s_ease-in-out_infinite]"
                  style={{
                    background: color,
                    height: "60%",
                    transformOrigin: "bottom",
                  }}
                />
                <span
                  className="w-[3px] rounded-sm animate-[solo-bar_0.7s_ease-in-out_infinite_0.15s]"
                  style={{
                    background: color,
                    height: "80%",
                    transformOrigin: "bottom",
                  }}
                />
                <span
                  className="w-[3px] rounded-sm animate-[solo-bar_1.0s_ease-in-out_infinite_0.3s]"
                  style={{
                    background: color,
                    height: "50%",
                    transformOrigin: "bottom",
                  }}
                />
              </div>
            )}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            {/* Titre + stats sur la même ligne */}
            <div className="flex items-baseline gap-2 min-w-0">
              <p
                className={`text-[13.5px] font-semibold truncate leading-tight shrink
                  ${selected ? "text-white" : "text-white/90"}`}
              >
                {beatmap.title}
              </p>
              <div className="flex items-center gap-1.5 flex-shrink-0 text-[10px]">
                <span
                  className="inline-flex items-center gap-0.5 font-semibold"
                  style={{ color }}
                >
                  <Star size={9} fill={color} strokeWidth={0} />
                  {Number(beatmap.difficulty ?? 0).toFixed(2)}
                </span>
                <span className="h-[3px] w-[3px] rounded-full bg-white/25" />
                <span className="text-white/45">{beatmap.bpm} BPM</span>
                <span className="h-[3px] w-[3px] rounded-full bg-white/25" />
                <span className="text-white/45">
                  {formatDuration(beatmap.duration_sec)}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-white/55 truncate mt-0.5">
              {beatmap.artist}
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}
