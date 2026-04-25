import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  X, Trophy, ExternalLink, User, Download,
  Smartphone, Monitor, Calendar, Eye, ShieldCheck,
} from "lucide-react";
import { difficultyColor, difficultyLabel, formatCount } from "@/lib/format";

// ─── Rank big-letter renderer ──────────────────────────────────────────
const RANK_COLORS = {
  XH: "#e9f4ff",
  X:  "#ffd76a",
  SH: "#d6e8ff",
  S:  "#ffd66a",
  A:  "#a7e9a1",
  B:  "#7abaff",
  C:  "#c78dff",
  D:  "#ff7b8a",
  F:  "#9aa0a6",
};
const RANK_SHORT = { XH: "SS", X: "SS", SH: "S", S: "S", A: "A", B: "B", C: "C", D: "D", F: "F" };

function RankGlyph({ rank, size = 180 }) {
  const key = (rank || "F").toUpperCase();
  const color = RANK_COLORS[key] || RANK_COLORS.F;
  const text = RANK_SHORT[key] || key;
  const withPlus = key === "XH" || key === "SH";
  return (
    <div
      className="flex items-center justify-center select-none"
      style={{
        fontSize: size,
        fontWeight: 900,
        lineHeight: 0.85,
        color,
        textShadow: `0 0 ${size / 2}px ${color}55, 0 10px 40px rgba(0,0,0,0.9)`,
        letterSpacing: "-0.08em",
      }}
    >
      <span style={{ fontStyle: "italic", transform: "skewX(-8deg)", display: "inline-block" }}>
        {text}
      </span>
      {withPlus && (
        <span style={{ fontSize: size * 0.45, marginLeft: 6, opacity: 0.95 }}>+</span>
      )}
    </div>
  );
}

// ─── Tiny inline rank badges on the left ───────────────────────────────
function RankStack({ activeRank }) {
  const stack = ["S", "A", "B", "C", "D"];
  const active = (activeRank || "").toUpperCase();
  return (
    <div className="flex flex-col gap-2">
      {stack.map((r) => {
        const c = RANK_COLORS[r];
        const isActive =
          active === r ||
          (r === "S" && (active === "SH" || active === "X" || active === "XH"));
        return (
          <span
            key={r}
            className="h-7 w-9 rounded-md flex items-center justify-center text-[12px] font-black transition-all"
            style={{
              color: isActive ? "#000" : c,
              background: isActive ? c : `${c}20`,
              border: `1px solid ${c}${isActive ? "" : "33"}`,
              boxShadow: isActive ? `0 0 14px ${c}66` : "none",
              opacity: isActive ? 1 : 0.5,
            }}
          >
            {r}
          </span>
        );
      })}
    </div>
  );
}

// ─── Country flag ──────────────────────────────────────────────────────
function FlagMark({ cc, size = 16 }) {
  if (!cc || cc.length !== 2) return null;
  const chars = Array.from(cc.toUpperCase())
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
  return <span style={{ fontSize: size, lineHeight: 1 }}>{chars}</span>;
}

// ─── Mods pills ────────────────────────────────────────────────────────
const MOD_TINT = {
  HD: "#ffd66a", HR: "#ff7b8a", DT: "#9ac1ff", NC: "#a8d4ff",
  FL: "#e0c47a", EZ: "#a7e9a1", HT: "#b0b6bd", NF: "#9aa0a6",
  SD: "#ff9eb0", PF: "#ffc488", SO: "#c78dff",
};
function ModHex({ mod }) {
  const c = MOD_TINT[mod] || "#ff7b8a";
  return (
    <span
      className="inline-flex items-center justify-center h-7 w-10 rounded-md font-black text-[11px] tracking-wider"
      style={{
        color: "#1a0b0b",
        background: c,
        boxShadow: `0 4px 16px ${c}44`,
      }}
    >
      {mod}
    </span>
  );
}

// ─── Main Modal ────────────────────────────────────────────────────────
/**
 * PerformanceModal — osu!lazer-inspired score detail dialog.
 *
 * Props:
 *  - open, onOpenChange : Radix dialog controls
 *  - score : normalised score object from /api/beatmaps/diff/:id/scores
 *  - beatmap : beatmapset context (title, artist, ...)
 *  - diff : selected difficulty record
 *  - rankIndex : 0-based index in the leaderboard → displayed as #N
 *  - osuScoreUrl : URL to open the score on osu.ppy.sh
 *  - osuUserUrl : URL to open the user on osu.ppy.sh
 */
export default function PerformanceModal({
  open,
  onOpenChange,
  score,
  beatmap,
  diff,
  rankIndex,
  osuScoreUrl,
  osuUserUrl,
}) {
  if (!score || !beatmap) return null;

  const rank = (score.rank || "F").toUpperCase();
  const pp = Number.isFinite(score.pp) && score.pp > 0 ? Math.round(score.pp) : null;
  const acc = score.accuracy != null ? (score.accuracy * 100).toFixed(2) : "—";
  const combo = score.max_combo || 0;
  const { h300 = 0, h100 = 0, h50 = 0, miss = 0 } = score.counts || {};
  const date = score.date ? new Date(score.date) : null;
  const dateStr = date
    ? date.toLocaleString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
  // "Joué dans" : stable (legacy) si legacy_score_id ou best_id existe ET legacy_score_id non null,
  // lazer sinon.
  const playedIn = score.legacy_score_id ? "Stable" : "Lazer";
  const playedInIcon = score.legacy_score_id ? Monitor : Smartphone;

  const diffColor = difficultyColor(diff?.difficulty_rating || beatmap.difficulty || 0);
  const cover = beatmap.cover_full_url || beatmap.cover_card_url || beatmap.cover_url;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[min(96vw,960px)] max-h-[92vh] overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0d] shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          data-testid="performance-modal"
        >
          {/* Accessible title — visually hidden */}
          <DialogPrimitive.Title className="sr-only">
            Performance de {score.user?.username || "joueur"}
          </DialogPrimitive.Title>

          {/* ── Top strip: "performance" + close ── */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-white/[0.02]">
            <div className="inline-flex items-center gap-2 text-white/65">
              <div className="h-7 w-7 rounded-md border border-white/10 bg-white/[0.04] flex items-center justify-center">
                <ShieldCheck size={13} strokeWidth={2} className="text-emerald-300/80" />
              </div>
              <span className="text-[11px] uppercase tracking-[0.32em] font-semibold">
                performance
              </span>
            </div>
            <DialogPrimitive.Close
              data-testid="performance-modal-close"
              className="inline-flex items-center justify-center h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/60 hover:text-white hover:border-white/25 transition-colors"
            >
              <X size={14} />
            </DialogPrimitive.Close>
          </div>

          {/* ── Map header ── */}
          <div className="px-6 py-4 border-b border-white/10">
            <h2
              className="text-[22px] md:text-[26px] font-semibold tracking-tight text-white leading-tight"
              data-testid="performance-modal-title"
            >
              {beatmap.title}{" "}
              <span className="text-white/45 font-medium">par {beatmap.artist}</span>
            </h2>
            {diff && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11px] font-bold text-black"
                  style={{ background: diffColor, boxShadow: `0 0 12px ${diffColor}55` }}
                >
                  ★ {Number(diff.difficulty_rating || 0).toFixed(2)}
                </span>
                <span className="text-[12px] text-white/80 font-semibold">
                  {diff.version}
                </span>
                <span className="text-[11px] text-white/40">
                  {difficultyLabel(diff.difficulty_rating)} ·
                  mappé par <span className="text-white/70">{beatmap.mapper}</span>
                </span>
              </div>
            )}
          </div>

          {/* ── Hero: rank + score + mods ── */}
          <div
            className="relative px-6 py-7"
            style={{
              backgroundImage: cover ? `url(${cover})` : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/50" />
            <div className="relative flex items-center gap-6">
              {/* Tiny rank stack on the very left */}
              <RankStack activeRank={rank} />

              {/* Big rank glyph */}
              <div className="flex-shrink-0">
                <RankGlyph rank={rank} size={150} />
              </div>

              {/* Score + meta */}
              <div className="flex-1 min-w-0">
                {score.mods && score.mods.length > 0 && (
                  <div className="flex items-center gap-1.5 mb-2">
                    {score.mods.slice(0, 8).map((m) => (
                      <ModHex key={m} mod={m} />
                    ))}
                  </div>
                )}
                <div
                  className="text-[46px] md:text-[58px] font-black text-white leading-none tabular-nums tracking-tight"
                  data-testid="performance-modal-score"
                  style={{ textShadow: "0 6px 24px rgba(0,0,0,0.85)" }}
                >
                  {(score.total_score || 0).toLocaleString("fr-FR")}
                </div>

                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px] max-w-[360px]">
                  <dt className="text-white/40">Joué par</dt>
                  <dd className="text-white font-semibold inline-flex items-center gap-1.5">
                    <FlagMark cc={score.user?.country_code} size={13} />
                    {osuUserUrl ? (
                      <a
                        href={osuUserUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {score.user?.username || "—"}
                      </a>
                    ) : (
                      score.user?.username || "—"
                    )}
                  </dd>
                  <dt className="text-white/40 inline-flex items-center gap-1">
                    <Eye size={10} /> Consulté
                  </dt>
                  <dd className="text-white/85">0 fois</dd>
                  <dt className="text-white/40 inline-flex items-center gap-1">
                    <Calendar size={10} /> Réalisé le
                  </dt>
                  <dd className="text-white/85">{dateStr}</dd>
                  <dt className="text-white/40 inline-flex items-center gap-1">
                    {React.createElement(playedInIcon, { size: 10 })} Joué dans
                  </dt>
                  <dd className="text-white/85">{playedIn}</dd>
                </dl>

                <div className="mt-4 inline-flex items-center gap-3">
                  <div className="rounded-md border border-white/10 bg-black/60 backdrop-blur-md px-3 py-1.5">
                    <p className="text-[9.5px] uppercase tracking-[0.24em] text-white/45">
                      Rang global
                    </p>
                    <p className="text-[20px] font-black text-white tabular-nums leading-none mt-0.5">
                      #{Number.isFinite(rankIndex) ? rankIndex + 1 : "—"}
                    </p>
                  </div>
                  {osuScoreUrl && (
                    <a
                      href={osuScoreUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="performance-modal-osu-link"
                      className="inline-flex items-center gap-2 rounded-full bg-[#66c6ff] hover:bg-[#8ad4ff] text-black px-4 py-2 text-[12px] font-semibold transition-colors"
                    >
                      <ExternalLink size={14} />
                      Voir sur osu!
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Bottom stats ── */}
          <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-5 border-t border-white/10">
            {/* Player card — takes the full height of the stats grid */}
            <a
              href={osuUserUrl || "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => { if (!osuUserUrl) e.preventDefault(); }}
              className="group relative overflow-hidden flex items-stretch rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/25 transition-colors min-h-[172px]"
              data-testid="performance-modal-user-card"
            >
              {/* Avatar — fills the card height on the left */}
              <div className="relative w-[160px] shrink-0 bg-white/[0.04] border-r border-white/10">
                {score.user?.avatar_url ? (
                  <img
                    src={score.user.avatar_url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-white/40">
                    <User size={40} />
                  </div>
                )}
                {/* dark vignette bottom for legibility if any text overlays */}
                <div className="absolute inset-x-0 bottom-0 h-[35%] bg-gradient-to-t from-black/70 to-transparent" />
              </div>

              {/* Info block — flex-1, stacks content top/bottom */}
              <div className="flex flex-col justify-between flex-1 min-w-0 px-5 py-4">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FlagMark cc={score.user?.country_code} size={15} />
                    <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">
                      {(score.user?.country_code || "").toUpperCase() || "—"}
                    </span>
                  </div>
                  <p
                    className="text-[24px] md:text-[28px] font-black tracking-tight text-white leading-[1.05] truncate"
                    title={score.user?.username}
                  >
                    {score.user?.username || "—"}
                  </p>
                  {score.user?.id && (
                    <p className="text-[10.5px] text-white/35 font-mono tabular-nums">
                      #{score.user.id}
                    </p>
                  )}
                </div>

                {/* Footer row: status + open profile hint */}
                <div className="flex items-end justify-between gap-2 mt-2">
                  <p className="text-[11px] text-white/60 inline-flex items-center gap-1.5 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80 shadow-[0_0_6px_#34d399]" />
                    En ligne
                  </p>
                  {osuUserUrl && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.22em] text-white/40 group-hover:text-white/80 transition-colors">
                      Profil osu!
                      <ExternalLink size={10} strokeWidth={2} />
                    </span>
                  )}
                </div>
              </div>
            </a>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3">
              <StatBox label="Précision" value={acc !== "—" ? `${acc}%` : "—"} valueClass="text-white" testid="performance-modal-acc" />
              <StatBox label="Combo max" value={`${combo}x`} valueClass="text-[#8be76b]" testid="performance-modal-combo" />
              <StatBox label="pp" value={pp != null ? pp.toLocaleString("fr-FR") : "—"} valueClass="text-[#ff88ac]" testid="performance-modal-pp" />

              <StatBox label="Great" value={formatCount(h300)} valueClass="text-white" />
              <StatBox label="Ok" value={formatCount(h100)} valueClass="text-white/85" />
              <StatBox label="Meh" value={formatCount(h50)} valueClass="text-white/75" />
              <StatBox
                label="Manqué"
                value={formatCount(miss)}
                valueClass={miss > 0 ? "text-[#ff7b8a]" : "text-white/50"}
              />
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function StatBox({ label, value, valueClass = "text-white", testid }) {
  return (
    <div
      className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
      data-testid={testid}
    >
      <p className="text-[9.5px] uppercase tracking-[0.22em] text-white/40">
        {label}
      </p>
      <p
        className={`text-[18px] font-black tabular-nums leading-tight mt-0.5 ${valueClass}`}
      >
        {value}
      </p>
    </div>
  );
}
