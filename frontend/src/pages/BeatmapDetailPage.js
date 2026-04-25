import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";import {
  ArrowLeft, Star, Timer, Activity, Play, Pause, Heart, User,
  ExternalLink, Download, CheckCircle2, Loader2
} from "lucide-react";
import BeatmapBackdrop from "@/components/BeatmapBackdrop";
import { fetchBeatmap } from "@/lib/api";
import { formatCount, formatDuration, difficultyColor, difficultyLabel } from "@/lib/format";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { useSavedBeatmaps } from "@/contexts/SavedBeatmapsContext";

const MODE_LABEL = { osu: "osu!std", taiko: "Taiko", fruits: "Catch", mania: "Mania" };

function DiffBadge({ diff }) {
  const color = difficultyColor(diff.difficulty_rating);
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 hover:bg-white/[0.06] transition-colors"
      title={`${diff.version} — ${diff.difficulty_rating.toFixed(2)}★`}
    >
      <span
        className="h-2 w-2 rounded-full flex-shrink-0"
        style={{ background: color, boxShadow: `0 0 6px ${color}` }}
      />
      <span className="flex-1 min-w-0 text-[12px] text-white truncate">{diff.version}</span>
      <span className="text-[11px] font-semibold flex-shrink-0" style={{ color }}>
        {diff.difficulty_rating.toFixed(2)}★
      </span>
      {diff.mode && diff.mode !== "osu" && (
        <span className="text-[9px] uppercase tracking-[0.2em] text-white/40 flex-shrink-0">
          {MODE_LABEL[diff.mode] || diff.mode}
        </span>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] backdrop-blur-md p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-white/45">
        <Icon size={12} strokeWidth={1.6} />
        {label}
      </div>
      <div className="mt-1 text-[20px] font-semibold text-white">{value}</div>
    </div>
  );
}

export default function BeatmapDetailPage() {
  const { id } = useParams();
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const { currentBeatmap, isPlaying, loading: audioLoading, toggle } = useAudioPlayer();
  const { isSaved, toggle: toggleSave } = useSavedBeatmaps();

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", data: null, error: null });
    fetchBeatmap(id)
      .then((data) => {
        if (cancelled) return;
        setState({ status: "ready", data, error: null });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({
          status: "error",
          data: null,
          error: e.response?.status === 404 ? "Beatmap not found" : e.message,
        });
      });
    return () => { cancelled = true; };
  }, [id]);

  const bm = state.data;
  const color = bm ? difficultyColor(bm.difficulty) : "#fff";
  const backdropSrc = bm?.cover_full_url || bm?.cover_card_url || bm?.cover_url || null;

  const isCurrentTrack = currentBeatmap?.id === bm?.id;
  const isCurrentlyPlaying = isCurrentTrack && isPlaying;
  const downloaded = bm ? isSaved(bm.id) : false;

  const sortedDiffs = bm?.difficulties
    ? [...bm.difficulties].sort((a, b) => {
        const modeOrder = { osu: 0, taiko: 1, fruits: 2, mania: 3 };
        const ma = modeOrder[a.mode] ?? 99;
        const mb = modeOrder[b.mode] ?? 99;
        if (ma !== mb) return ma - mb;
        return a.difficulty_rating - b.difficulty_rating;
      })
    : [];

  return (
    <main className="relative min-h-screen px-6 md:px-10 pt-28 pb-20">
      <BeatmapBackdrop src={backdropSrc} accent={color} />

      <div className="relative z-10 w-full max-w-[1100px] mx-auto">
        <Link
          to="/library"
          data-testid="beatmap-back"
          className="group inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-white/60 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
          Library
        </Link>

        {/* LOADING */}
        {state.status === "loading" && (
          <div className="mt-10 grid md:grid-cols-[320px,1fr] gap-8">
            <div className="aspect-square rounded-2xl border border-white/10 bg-white/[0.03] animate-pulse" />
            <div className="space-y-4">
              <div className="h-10 rounded-lg bg-white/[0.05] animate-pulse w-2/3" />
              <div className="h-6 rounded bg-white/[0.05] animate-pulse w-1/2" />
              <div className="h-24 rounded-2xl bg-white/[0.04] animate-pulse" />
            </div>
          </div>
        )}

        {/* ERROR */}
        {state.status === "error" && (
          <div
            data-testid="beatmap-error"
            className="mt-10 rounded-2xl border border-red-400/20 bg-red-500/5 backdrop-blur-md p-10 text-center"
          >
            <p className="text-red-200">{state.error}</p>
          </div>
        )}

        {/* READY */}
        {state.status === "ready" && bm && (
          <>
            <div data-testid="beatmap-detail" className="mt-8 grid md:grid-cols-[340px,1fr] gap-8">
              {/* Cover */}
              <div
                className="relative aspect-square rounded-2xl overflow-hidden border border-white/10"
                style={{ borderColor: `${color}44` }}
              >
                {bm.cover_url && (
                  <img
                    src={bm.cover_url}
                    alt={`${bm.title} cover`}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                {/* Difficulty badge */}
                <div
                  className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 backdrop-blur px-3 py-1 text-[11px] font-semibold"
                  style={{ color }}
                >
                  <Star size={13} fill={color} strokeWidth={2} />
                  {bm.difficulty.toFixed(2)} · {difficultyLabel(bm.difficulty)}
                </div>

                {/* ID badge */}
                <div className="absolute top-3 right-3 rounded-full bg-black/55 backdrop-blur px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/75">
                  #{bm.id}
                </div>

                {/* Audio preview button on cover */}
                {bm.audio_url && (
                  <button
                    type="button"
                    onClick={() => toggle(bm)}
                    className="absolute bottom-4 right-4 h-12 w-12 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95"
                    style={{ background: color }}
                    aria-label={isCurrentlyPlaying ? "Pause preview" : "Écouter le preview"}
                  >
                    {audioLoading && isCurrentTrack ? (
                      <Loader2 size={20} className="animate-spin text-black" />
                    ) : isCurrentlyPlaying ? (
                      <Pause size={20} fill="black" className="text-black" />
                    ) : (
                      <Play size={20} fill="black" className="text-black" />
                    )}
                  </button>
                )}
              </div>

              {/* Meta */}
              <div>
                <span className="text-[11px] uppercase tracking-[0.3em] text-white/45">
                  {bm.genre || "Unknown genre"} · {bm.mode}
                  {bm.language && ` · ${bm.language}`}
                </span>
                <h1 className="mt-2 text-[38px] md:text-[56px] leading-[0.95] tracking-tight font-semibold text-white">
                  {bm.title}
                </h1>
                <p className="mt-2 text-[16px] md:text-[18px] text-white/75">
                  by <span className="text-white">{bm.artist}</span>
                </p>
                <p className="mt-1 inline-flex items-center gap-1.5 text-[12px] uppercase tracking-[0.24em] text-white/55">
                  <User size={12} />
                  mapped by <span className="text-white/85 normal-case tracking-normal">{bm.mapper}</span>
                </p>

                {/* Stats */}
                <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat icon={Activity} label="BPM" value={bm.bpm} />
                  <Stat icon={Timer} label="Duration" value={formatDuration(bm.duration_sec)} />
                  <Stat icon={Play} label="Plays" value={formatCount(bm.plays_count)} />
                  <Stat icon={Heart} label="Favorites" value={formatCount(bm.favorites_count)} />
                </div>

                {/* Actions */}
                <div className="mt-8 flex items-center gap-3 flex-wrap">
                  {/* Download button */}
                  <button
                    type="button"
                    onClick={() => toggleSave(bm)}
                    className="inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-[12px] uppercase tracking-[0.22em] font-semibold transition-all hover:scale-105 active:scale-95"
                    style={
                      downloaded
                        ? { borderColor: `${color}66`, background: `${color}22`, color }
                        : { borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.75)" }
                    }
                  >
                    {downloaded ? <CheckCircle2 size={14} /> : <Download size={14} />}
                    {downloaded ? "Téléchargé" : "Télécharger"}
                  </button>

                  {/* Link to osu.ppy.sh */}
                  <a
                    href={`https://osu.ppy.sh/beatmapsets/${bm.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-[12px] uppercase tracking-[0.22em] text-white/65 hover:text-white hover:border-white/25 transition-colors"
                  >
                    <ExternalLink size={13} strokeWidth={1.6} />
                    osu!ppy.sh
                  </a>

                  {/* Play button — link to Solo */}
                  <Link
                    to={`/solo?beatmap=${bm.id}`}
                    className="inline-flex items-center gap-2 rounded-full bg-white text-black px-5 py-2.5 text-[12px] uppercase tracking-[0.22em] font-semibold hover:bg-white/90 transition-colors hover:scale-105 active:scale-95"
                  >
                    <Play size={14} fill="black" /> Play
                  </Link>
                </div>
              </div>
            </div>

            {/* Difficulties section */}
            {sortedDiffs.length > 0 && (
              <div className="mt-12">
                <div className="flex items-center gap-3 mb-5">
                  <span
                    className="h-[6px] w-[6px] rounded-full"
                    style={{ background: color, boxShadow: `0 0 8px ${color}` }}
                  />
                  <span className="text-[10px] uppercase tracking-[0.3em] text-white/45">
                    {sortedDiffs.length} difficultés
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {sortedDiffs.map((diff) => (
                    <DiffBadge key={diff.id} diff={diff} />
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {bm.tags && bm.tags.trim() && (
              <div className="mt-10">
                <p className="text-[10px] uppercase tracking-[0.28em] text-white/35 mb-3">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {bm.tags
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 30)
                    .map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] text-white/45 hover:text-white/75 hover:border-white/20 transition-colors cursor-default"
                      >
                        {tag}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
