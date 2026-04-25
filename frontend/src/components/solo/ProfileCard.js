import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trophy, TrendingUp, Crosshair, Flame, Play, Shuffle, Settings, Sparkles } from "lucide-react";
import ModsModal from "./ModsModal";

/**
 * Profile card pinned at the bottom of the Solo song list.
 * - Header always visible (avatar + name + progression)
 * - Stats 2×2 revealed on hover (above buttons)
 * - Top row: Random + Mods
 * - Bottom row: Play + Settings
 */
export default function ProfileCard({ accent = "#b388ff", beatmap, selectedDiff, mods = new Set(), onModToggle, onRandom }) {
  const [modsOpen, setModsOpen] = useState(false);
  const navigate = useNavigate();

  const canPlay = Boolean(beatmap?.id);

  function handlePlay() {
    if (!canPlay) return;
    const sid = beatmap.id;
    const params = new URLSearchParams();
    // Prefer the user-selected diff; fallback to the hardest osu!std diff.
    let diff = selectedDiff;
    if (!diff && Array.isArray(beatmap?.difficulties)) {
      const std = beatmap.difficulties.filter((d) => d.mode === "osu" || d.mode === undefined);
      const pool = std.length ? std : beatmap.difficulties;
      diff = pool.reduce(
        (acc, d) => ((d.difficulty_rating || 0) > (acc?.difficulty_rating || 0) ? d : acc),
        null
      );
    }
    if (diff?.id) params.set("bid", diff.id);
    if (diff?.version) params.set("v", diff.version);
    if (beatmap.title) params.set("title", beatmap.title);
    if (beatmap.artist) params.set("artist", beatmap.artist);
    navigate(`/play/${sid}?${params.toString()}`);
  }

  const player = {
    name: "Guest",
    country: "FR",
    level: 87,
    levelProgress: 0.42,
    pp: 4821,
    global_rank: 124503,
    accuracy: 97.84,
    playcount: 1823,
    avatar:
      "https://api.dicebear.com/7.x/bottts-neutral/svg?seed=osu-guest&radius=12&backgroundColor=1a1a1f",
  };

  const circ = 2 * Math.PI * 30;

  const stats = [
    {
      icon: <Trophy size={13} strokeWidth={1.7} className="text-white/45" />,
      label: "PERFORMANCE",
      value: (
        <span>
          {player.pp.toLocaleString("fr-FR")}
          <span className="text-[13px] font-normal text-white/50 ml-0.5">pp</span>
        </span>
      ),
    },
    {
      icon: <TrendingUp size={13} strokeWidth={1.7} className="text-white/45" />,
      label: "RANG GLOBAL",
      value: `#${player.global_rank.toLocaleString("fr-FR")}`,
    },
    {
      icon: <Crosshair size={13} strokeWidth={1.7} className="text-white/45" />,
      label: "PRÉCISION",
      value: `${player.accuracy.toFixed(2)}%`,
    },
    {
      icon: <Flame size={13} strokeWidth={1.7} className="text-white/45" />,
      label: "PARTIES",
      value: player.playcount.toLocaleString("fr-FR"),
    },
  ];

  return (
    <>
      <div
        className="group relative mx-6 mr-12 mb-4 mt-2 rounded-2xl border border-white/10 bg-black/60 backdrop-blur-xl overflow-hidden transition-all duration-300"
        style={{ boxShadow: `0 20px 48px -16px ${accent}44` }}
        data-testid="solo-profile-card"
      >
        {/* Accent stripe left */}
        <div
          aria-hidden
          className="absolute left-0 top-0 h-full w-[3px] pointer-events-none"
          style={{ background: accent, boxShadow: `0 0 12px ${accent}` }}
        />

        {/* ── Header: always visible ── */}
        <div className="flex items-center gap-4 px-5 pt-5 pb-3">
          <div className="relative flex-shrink-0 h-[72px] w-[72px]">
            {/* Progression ring — viewBox matches display size so inset perfectly aligns
                with the inner edge of the ring track. r=30 stroke=3.5 → ring inner edge
                at radius ≈28.25 → avatar at inset 8px sits flush inside the ring. */}
            <svg width="72" height="72" viewBox="0 0 72 72" className="block absolute inset-0">
              <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3.5" />
              <circle
                cx="36" cy="36" r="30"
                fill="none"
                stroke={accent}
                strokeWidth="3.5"
                strokeDasharray={circ}
                strokeDashoffset={circ * (1 - player.levelProgress)}
                strokeLinecap="round"
                transform="rotate(-90 36 36)"
                style={{ filter: `drop-shadow(0 0 7px ${accent}99)` }}
              />
            </svg>
            <div className="absolute inset-[8px] rounded-full overflow-hidden bg-white/10 border border-white/10">
              <img src={player.avatar} alt="" className="w-full h-full object-cover block" loading="lazy" />
            </div>
            <div
              className="absolute -bottom-1 -right-1 inline-flex items-center justify-center h-[22px] min-w-[22px] px-1.5 rounded-full text-[11px] font-black text-black"
              style={{ background: accent, boxShadow: `0 0 10px ${accent}99` }}
            >
              {player.level}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[15px] font-bold text-white truncate" data-testid="solo-profile-name">
                {player.name}
              </p>
              <span className="inline-flex items-center gap-1 text-[11px] text-white/45">
                <span className="inline-block h-[11px] w-[16px] rounded-sm bg-gradient-to-b from-[#0055A4] via-white to-[#EF4135]" />
                {player.country}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-white/40 tracking-wide uppercase">
              Niveau {player.level} &bull; {Math.round(player.levelProgress * 100)}% Progression
            </p>
          </div>
        </div>

        {/* ── Stats grid — revealed on hover ── */}
        <div className="overflow-hidden max-h-0 opacity-0 translate-y-2 group-hover:max-h-[220px] group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 ease-out">
          <div className="grid grid-cols-2 gap-2 px-4 pb-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-xl bg-white/[0.04] border border-white/[0.07] px-3.5 py-2.5"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {s.icon}
                  <span className="text-[9.5px] uppercase tracking-[0.16em] text-white/40 font-medium">
                    {s.label}
                  </span>
                </div>
                <p className="text-[17px] font-bold text-white leading-tight tabular-nums">
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Buttons ── */}
        <div className="px-4 pb-4 pt-1 space-y-2">

          {/* Top row: Random + Mods */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRandom}
              title="Maps aléatoires"
              data-testid="solo-random-button"
              className="flex-1 h-[40px] flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] text-white/65 hover:text-white hover:bg-white/[0.10] hover:border-white/25 transition-all text-[11px] font-semibold uppercase tracking-[0.18em]"
            >
              <Shuffle size={14} strokeWidth={1.8} />
              Random
            </button>

            <button
              type="button"
              onClick={() => setModsOpen(true)}
              data-testid="solo-mods-toggle"
              title="Mods"
              className={`flex-1 h-[40px] flex items-center justify-center gap-2 rounded-xl border font-bold uppercase tracking-[0.18em] text-[11px] transition-all active:scale-[0.97] ${
                mods.size > 0
                  ? "border-transparent text-black"
                  : "border-white/10 bg-white/[0.05] text-white/65 hover:text-white hover:bg-white/[0.10] hover:border-white/25"
              }`}
              style={
                mods.size > 0
                  ? { background: accent, boxShadow: `0 6px 20px ${accent}55` }
                  : {}
              }
            >
              <Sparkles size={13} strokeWidth={1.9} />
              Mods
              {mods.size > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-black/25 text-[10px] font-black">
                  {mods.size}
                </span>
              )}
            </button>
          </div>

          {/* Bottom row: Play + Settings */}
          <div className="flex items-center gap-2">
            {/* PLAY */}
            <div className="relative flex-1">
              <button
                type="button"
                onClick={handlePlay}
                disabled={!canPlay}
                data-testid="solo-play-button"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 text-[12px] uppercase tracking-[0.24em] font-black text-black transition-all hover:scale-[1.02] active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: accent,
                  boxShadow: `0 8px 28px ${accent}55, inset 0 0 0 1px rgba(255,255,255,0.2)`,
                }}
                title={canPlay ? "Lancer le gameplay (WebOsu 2)" : "Sélectionne une map d'abord"}
              >
                <Play size={14} fill="black" strokeWidth={0} />
                Play
              </button>
            </div>

            {/* SETTINGS */}
            <button
              type="button"
              title="Paramètres"
              data-testid="solo-settings-button"
              className="h-[46px] px-4 flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] text-white/65 hover:text-white hover:bg-white/[0.10] hover:border-white/25 font-semibold uppercase tracking-[0.18em] text-[11px] transition-all active:scale-[0.97]"
            >
              <Settings size={13} strokeWidth={1.8} />
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* Mods modal — outside the card so it overlays the full screen */}
      <ModsModal
        open={modsOpen}
        onClose={() => setModsOpen(false)}
        mods={mods}
        onToggle={onModToggle}
        accent={accent}
      />
    </>
  );
}
