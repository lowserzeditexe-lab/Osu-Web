import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Trophy,
  TrendingUp,
  Crosshair,
  Flame,
  Play,
  Shuffle,
  Settings,
  Sparkles,
  Pencil,
  Check,
  X,
} from "lucide-react";
import ModsModal from "./ModsModal";
import { useUser } from "@/contexts/UserContext";

/**
 * Profile card pinned at the top of the Solo right column.
 * - Header always visible (avatar + name + progression)
 * - Username is click-to-edit (pencil icon on hover, Enter/blur save, Esc cancel)
 * - Stats 2×2 revealed on hover (above buttons)
 * - Top row: Random + Mods
 * - Bottom row: Play + Settings
 *
 * The non-username stats (level, pp, rank, accuracy, playcount) are still
 * mock values — they'll be wired to real scoring data later.
 */
export default function ProfileCard({
  accent = "#b388ff",
  beatmap,
  selectedDiff,
  mods = new Set(),
  onModToggle,
  onRandom,
}) {
  const [modsOpen, setModsOpen] = useState(false);
  const navigate = useNavigate();
  const { user, updateUsername } = useUser();

  const canPlay = Boolean(beatmap?.id);
  const isLocalImport = Boolean(beatmap?.is_local_import);

  function handlePlay() {
    if (!canPlay) return;
    const sid = beatmap.id;
    const params = new URLSearchParams();
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
    if (isLocalImport) params.set("local", "1");
    navigate(`/play/${encodeURIComponent(sid)}?${params.toString()}`);
  }

  // ── Username inline editor ─────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function startEdit() {
    setDraft(user?.username || "");
    setEditing(true);
  }
  function cancelEdit() {
    setEditing(false);
    setDraft("");
  }
  async function commitEdit() {
    const v = (draft || "").trim();
    if (!v || v === user?.username) {
      cancelEdit();
      return;
    }
    setSaving(true);
    try {
      await updateUsername(v);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[profile] save username failed:", err?.response?.data || err);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  const username = user?.username || "—";
  const country = user?.country || "FR";

  // Mock stats (to be wired to real scores later). Keeping the visual
  // structure intact so we don't have to redo the layout when real data
  // arrives.
  const player = {
    level: 87,
    levelProgress: 0.42,
    pp: 4821,
    global_rank: 124503,
    accuracy: 97.84,
    playcount: 1823,
    avatar:
      "https://api.dicebear.com/7.x/bottts-neutral/svg?seed=" +
      encodeURIComponent(user?.id || "guest") +
      "&radius=12&backgroundColor=1a1a1f",
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
        className="group relative rounded-2xl border border-white/10 bg-black/60 backdrop-blur-xl overflow-hidden transition-all duration-300"
        style={{ boxShadow: `0 20px 48px -16px ${accent}44` }}
        data-testid="solo-profile-card"
      >
        {/* Accent stripe left */}
        <div
          aria-hidden
          className="absolute left-0 top-0 h-full w-[3px] pointer-events-none"
          style={{ background: accent, boxShadow: `0 0 12px ${accent}` }}
        />

        {/* Header */}
        <div className="flex items-center gap-4 px-5 pt-5 pb-3">
          <div className="relative flex-shrink-0 h-[72px] w-[72px]">
            <svg
              width="96"
              height="96"
              viewBox="0 0 96 96"
              className="block absolute -inset-3 overflow-visible pointer-events-none"
            >
              <circle cx="48" cy="48" r="30" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3.5" />
              <circle
                cx="48" cy="48" r="30"
                fill="none"
                stroke={accent}
                strokeWidth="3.5"
                strokeDasharray={circ}
                strokeDashoffset={circ * (1 - player.levelProgress)}
                strokeLinecap="round"
                transform="rotate(-90 48 48)"
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
            {/* ── Username row ── */}
            {editing ? (
              <div className="flex items-center gap-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    else if (e.key === "Escape") cancelEdit();
                  }}
                  onBlur={commitEdit}
                  maxLength={30}
                  disabled={saving}
                  data-testid="solo-profile-name-input"
                  className="flex-1 min-w-0 px-2 py-1 rounded-md bg-white/[0.08] border border-white/20 text-[14px] font-bold text-white outline-none focus:border-white/40 disabled:opacity-50"
                />
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={commitEdit}
                  disabled={saving}
                  data-testid="solo-profile-name-save"
                  className="h-[26px] w-[26px] flex items-center justify-center rounded-md text-emerald-400 hover:bg-emerald-500/10"
                >
                  <Check size={14} strokeWidth={2.4} />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={cancelEdit}
                  disabled={saving}
                  className="h-[26px] w-[26px] flex items-center justify-center rounded-md text-white/40 hover:bg-white/5"
                >
                  <X size={14} strokeWidth={2.4} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={startEdit}
                  data-testid="solo-profile-name"
                  title="Clique pour changer ton pseudo"
                  className="flex items-center gap-1.5 group/name max-w-full"
                >
                  <p className="text-[15px] font-bold text-white truncate leading-tight">
                    {username}
                  </p>
                  <Pencil
                    size={11}
                    strokeWidth={2}
                    className="text-white/30 group-hover/name:text-white/70 transition-colors flex-shrink-0"
                  />
                </button>
                <span className="inline-flex items-center gap-1 text-[11px] text-white/45 flex-shrink-0">
                  <span className="inline-block h-[11px] w-[16px] rounded-sm bg-gradient-to-b from-[#0055A4] via-white to-[#EF4135]" />
                  {country}
                </span>
              </div>
            )}
            <p className="mt-1 text-[10px] text-white/40 tracking-wide uppercase">
              Niveau {player.level} &bull; {Math.round(player.levelProgress * 100)}% Progression
            </p>
          </div>
        </div>

        {/* Stats grid — revealed on hover */}
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

        {/* Buttons */}
        <div className="px-4 pb-4 pt-1 space-y-2">
          {/* Top row: Random + Mods */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRandom}
              title="Map aléatoire"
              data-testid="solo-random-button"
              className="flex-1 h-[40px] flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] text-white/65 hover:text-white hover:bg-white/[0.10] hover:border-white/25 transition-all text-[11px] font-semibold uppercase tracking-[0.18em] disabled:opacity-40"
              disabled={!onRandom}
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
                title={canPlay ? "Lancer le gameplay (WebOsu 2)" : "Importe une beatmap d'abord"}
              >
                <Play size={14} fill="black" strokeWidth={0} />
                Play
              </button>
            </div>

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
