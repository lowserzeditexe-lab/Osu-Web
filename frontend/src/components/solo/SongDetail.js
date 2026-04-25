import React, { useMemo, useState } from "react";
import {
  Play,
  Star,
  Activity,
  Timer,
  Heart,
  User,
  Tag,
  Globe,
  Music2,
  Hash,
} from "lucide-react";
import {
  formatCount,
  formatDuration,
  difficultyColor,
  difficultyLabel,
} from "@/lib/format";
import { applyMods, totalMultiplier } from "@/lib/mods";
import StatBar from "./StatBar";
import Leaderboard from "./Leaderboard";

export default function SongDetail({
  beatmap,
  selectedDiff,
  mods,
  onModToggle,
  onRandom,
  accent = "#b388ff",
}) {
  const [showComing, setShowComing] = useState(false);

  const displayDiff = selectedDiff || beatmap || {};
  const rating =
    displayDiff.difficulty_rating ?? displayDiff.difficulty ?? 0;
  const color = difficultyColor(rating) || accent;
  const stars = rating.toFixed(2);

  // Base stats from the selected diff (fallback to beatmap aggregate).
  const base = useMemo(
    () => ({
      cs: displayDiff.cs ?? null,
      ar: displayDiff.ar ?? null,
      od: displayDiff.od ?? null,
      hp: displayDiff.hp ?? null,
      bpm: displayDiff.bpm ?? beatmap?.bpm ?? 0,
    }),
    [displayDiff, beatmap]
  );
  const modified = useMemo(() => applyMods(base, mods), [base, mods]);

  if (!beatmap) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center gap-4 text-white/35"
        data-testid="solo-detail-empty"
      >
        <div className="h-24 w-24 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center backdrop-blur-xl">
          <Play size={28} strokeWidth={1.2} />
        </div>
        <p className="text-[12px] uppercase tracking-[0.3em] text-white/45">
          Sélectionne une map
        </p>
        <p className="text-[11px] text-white/30 max-w-xs text-center">
          Parcours la liste à droite ou utilise la recherche pour commencer.
        </p>
      </div>
    );
  }

  const mult = totalMultiplier(mods);
  const hasModdedStats =
    (modified.cs != null && Math.abs((modified.cs ?? 0) - (base.cs ?? 0)) > 0.01) ||
    (modified.ar != null && Math.abs((modified.ar ?? 0) - (base.ar ?? 0)) > 0.01) ||
    (modified.od != null && Math.abs((modified.od ?? 0) - (base.od ?? 0)) > 0.01) ||
    (modified.hp != null && Math.abs((modified.hp ?? 0) - (base.hp ?? 0)) > 0.01);

  const effectiveBpm = modified.bpm ?? base.bpm;
  const effectiveDuration = Math.round(
    (beatmap.duration_sec ?? 0) / (modified.length_rate || 1)
  );

  return (
    <div className="h-full flex flex-col max-w-[780px]" data-testid="solo-detail">
      {/* Titre + ID + artist + mapper + stats inline */}
      <div className="shrink min-w-0 mb-5">
        <div className="flex items-start gap-3 flex-wrap">
          <h1
            className="text-[40px] xl:text-[52px] leading-[1.02] font-black tracking-tight text-white min-w-0"
            style={{ textShadow: "0 6px 30px rgba(0,0,0,0.7)" }}
            data-testid="solo-detail-title"
          >
            {beatmap.title}
          </h1>
          <a
            href={`https://osu.ppy.sh/beatmapsets/${beatmap.id}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 xl:mt-3 shrink-0 inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/40 backdrop-blur-xl px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white/60 hover:text-white hover:border-white/25 transition-colors"
            style={{ boxShadow: `0 0 0 0 ${color}00` }}
            title={`Beatmapset ID · ouvrir sur osu.ppy.sh`}
            data-testid="solo-detail-id"
          >
            <Hash size={11} strokeWidth={2} />
            <span>{beatmap.id}</span>
          </a>
        </div>
        <p className="mt-2 text-[17px] text-white/70 font-medium">{beatmap.artist}</p>
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] text-white/45">
          <User size={12} strokeWidth={1.6} />
          mapped by{" "}
          <span className="text-white/75 font-medium">{beatmap.mapper}</span>
        </p>

        {/* CS / AR / OD / HP inline sous le mappeur */}
        <div className="mt-2 flex items-center gap-4 text-[12px]">
          {[
            { label: "CS", value: modified.cs },
            { label: "AR", value: modified.ar },
            { label: "OD", value: modified.od },
            { label: "HP", value: modified.hp },
          ].map(({ label, value }) => (
            <span key={label} className="flex items-center gap-1">
              <span className="text-white/40 font-medium">{label}:</span>
              <span className="text-white/90 font-semibold tabular-nums">
                {Number(value ?? 0).toFixed(1)}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Difficulty pills */}
      <div className="flex items-center gap-2 flex-wrap mb-5">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-black"
          style={{ background: color, boxShadow: `0 6px 22px ${color}55` }}
          data-testid="solo-detail-star-rating"
        >
          <Star size={11} fill="black" strokeWidth={0} />
          {stars} · {difficultyLabel(rating)}
        </span>
        {displayDiff.version && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/35 backdrop-blur-xl px-3 py-1.5 text-[11.5px] text-white/80">
            {displayDiff.version}
          </span>
        )}
        {mods.size > 0 && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/35 backdrop-blur-xl px-3 py-1.5 text-[11.5px] font-semibold"
            style={{ color: mult > 1.001 ? "#66e3a6" : mult < 0.999 ? "#ff7b8a" : "white" }}
            data-testid="solo-detail-multiplier"
          >
            ×{mult.toFixed(2)}
          </span>
        )}
      </div>

      {/* Quick stats row (BPM / Length / favs / plays) */}
      <div className="flex flex-wrap items-stretch gap-2 mb-6">
        <StatInline
          icon={Activity}
          label="BPM"
          value={Math.round(effectiveBpm) || "—"}
          changed={Math.abs(effectiveBpm - base.bpm) > 0.5}
        />
        <StatInline
          icon={Timer}
          label="Durée"
          value={formatDuration(effectiveDuration || beatmap.duration_sec)}
          changed={modified.length_rate !== 1 && (beatmap.duration_sec ?? 0) > 0}
        />
        <StatInline icon={Heart} label="Favs" value={formatCount(beatmap.favorites_count)} />
        {Number.isFinite(beatmap.plays_count) && (
          <StatInline icon={Play} label="Plays" value={formatCount(beatmap.plays_count)} />
        )}
        {beatmap.genre && (
          <StatInline icon={Music2} label="Genre" value={beatmap.genre} />
        )}
        {beatmap.language && (
          <StatInline icon={Globe} label="Langue" value={beatmap.language} />
        )}
      </div>

      {/* Tags */}
      {Array.isArray(beatmap.tags) && beatmap.tags.length > 0 && (
        <section className="mb-3">
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/35 mb-2.5 inline-flex items-center gap-1.5">
            <Tag size={10} strokeWidth={1.6} /> Tags
          </p>
          <div className="flex flex-wrap gap-1.5">
            {beatmap.tags.slice(0, 8).map((t) => (
              <span
                key={t}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10.5px] text-white/55"
              >
                {t}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Leaderboard — directly attached to the map info, flexes to remaining height */}
      <Leaderboard
        diffId={selectedDiff?.id || null}
        setId={beatmap?.id || null}
        status={beatmap?.status || null}
        beatmap={beatmap}
        diff={selectedDiff}
        accent={color}
      />
    </div>
  );
}

function StatInline({ icon: Icon, label, value, changed = false }) {
  return (
    <div
      className={`rounded-xl border bg-black/35 backdrop-blur-xl px-3.5 py-2 min-w-[92px] transition-colors ${
        changed ? "border-[#5599ff]/40" : "border-white/10"
      }`}
    >
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.22em] text-white/40">
        <Icon size={10} strokeWidth={1.6} />
        {label}
      </div>
      <div
        className={`mt-0.5 text-[14px] font-semibold truncate ${
          changed ? "text-[#8fb8ff]" : "text-white"
        }`}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}
