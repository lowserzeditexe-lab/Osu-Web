import React from "react";
import { Link } from "react-router-dom";
import { Star, Timer, Activity, Play, Pause } from "lucide-react";
import { formatCount, formatDuration, difficultyColor } from "@/lib/format";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";

export default function BeatmapCard({ beatmap, compact = false }) {
  const color = difficultyColor(beatmap.difficulty);
  const { currentBeatmap, isPlaying, toggle } = useAudioPlayer();

  const isCurrentTrack = currentBeatmap?.id === beatmap.id;
  const isCurrentlyPlaying = isCurrentTrack && isPlaying;

  function handlePlay(e) {
    e.preventDefault();
    e.stopPropagation();
    toggle(beatmap);
  }

  return (
    <Link
      to={`/library/b/${beatmap.id}`}
      data-testid={`beatmap-card-${beatmap.id}`}
      className="group relative overflow-hidden rounded-2xl border bg-white/[0.035] backdrop-blur-xl hover:border-white/25 transition-all flex flex-col"
      style={{
        borderColor: isCurrentTrack ? `${color}66` : "rgba(255,255,255,0.1)",
        boxShadow: isCurrentTrack ? `0 0 20px ${color}22` : "none",
      }}
    >
      {/* Cover */}
      <div className="relative aspect-square overflow-hidden bg-white/[0.04]">
        {beatmap.cover_url ? (
          <img
            src={beatmap.cover_url}
            alt={`${beatmap.title} cover`}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-white/30 text-4xl font-semibold">
            {beatmap.title?.[0] || "?"}
          </div>
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

        {/* Difficulty badge */}
        <div
          className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/55 backdrop-blur px-2 py-0.5 text-[10px] font-semibold"
          style={{ color }}
        >
          <Star size={11} strokeWidth={2} fill={color} />
          {beatmap.difficulty?.toFixed(2)}
        </div>

        {/* ID badge */}
        <div className="absolute top-2 right-2 rounded-full bg-black/55 backdrop-blur px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-white/70">
          #{beatmap.id}
        </div>

        {/* Play button — shows on hover, always visible if current */}
        {beatmap.audio_url && (
          <button
            type="button"
            onClick={handlePlay}
            aria-label={isCurrentlyPlaying ? "Pause" : "Préécouter"}
            className={`absolute bottom-2 right-2 h-9 w-9 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${
              isCurrentTrack
                ? "opacity-100 scale-100"
                : "opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100"
            }`}
            style={{ background: isCurrentTrack ? color : "rgba(255,255,255,0.9)", color: isCurrentTrack ? "#000" : "#000" }}
          >
            {isCurrentlyPlaying ? <Pause size={15} fill="black" /> : <Play size={15} fill="black" />}
          </button>
        )}
      </div>

      {/* Meta */}
      <div className={`relative flex-1 flex flex-col ${compact ? "p-3" : "p-4"}`}>
        <h3
          className={`font-semibold text-white leading-tight truncate pr-5 ${compact ? "text-[13px]" : "text-[14px] md:text-[15px]"}`}
          title={beatmap.title}
        >
          {beatmap.title}
        </h3>
        <p className="text-[12px] text-white/55 truncate" title={beatmap.artist}>
          {beatmap.artist}
        </p>
        <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-white/45">
          <span className="truncate" title={`mapped by ${beatmap.mapper}`}>
            by <span className="text-white/70">{beatmap.mapper}</span>
          </span>
        </div>
        <div className="mt-2 flex items-center gap-3 text-[10px] text-white/55">
          <span className="inline-flex items-center gap-1">
            <Activity size={11} strokeWidth={1.6} />
            {beatmap.bpm}
          </span>
          <span className="inline-flex items-center gap-1">
            <Timer size={11} strokeWidth={1.6} />
            {formatDuration(beatmap.duration_sec)}
          </span>
          <span className="inline-flex items-center gap-1 ml-auto">
            <Play size={11} strokeWidth={1.6} />
            {formatCount(beatmap.plays_count)}
          </span>
        </div>
      </div>
    </Link>
  );
}
