import React, { useEffect, useMemo, useRef, useState } from "react";
import { Trophy, Crown, Medal, Award, User, Globe2, Sparkles, ExternalLink } from "lucide-react";
import { fetchBeatmapScores } from "@/lib/api";
import { formatCount } from "@/lib/format";
import PerformanceModal from "./PerformanceModal";

// Build an osu.ppy.sh URL for a given score record so users can verify the data
// directly on the official osu! site.
//
// IMPORTANT: osu! has TWO score URL formats on the public website:
// • Legacy scores (returned by /api/v2/beatmaps/{id}/scores) → /scores/{ruleset}/{id}
// • Solo (lazer) scores → /scores/{id}
// Scores returned from the public leaderboard endpoint are legacy → we MUST include
// the ruleset segment, otherwise osu.ppy.sh renders its 404 "introuvable" page.
function osuScoreUrl(score, diffId, mode = "osu") {
  if (!score) return null;
  const id = score.id || score.best_id || null;
  if (id != null) {
    return `https://osu.ppy.sh/scores/${mode}/${id}`;
  }
  return diffId ? `https://osu.ppy.sh/b/${diffId}` : null;
}
function osuUserUrl(userId) {
  return userId ? `https://osu.ppy.sh/users/${userId}` : null;
}
// Canonical osu.ppy.sh leaderboard page for a specific difficulty of a beatmapset.
// Format: https://osu.ppy.sh/beatmapsets/{setId}#osu/{diffId}
// This is exactly the page shown when the user picks a diff on osu.ppy.sh, so the
// scores rendered here should match 1:1 with what this link opens.
function osuLeaderboardUrl(setId, diffId, mode = "osu") {
  if (setId && diffId) {
    return `https://osu.ppy.sh/beatmapsets/${setId}#${mode}/${diffId}`;
  }
  if (diffId) return `https://osu.ppy.sh/b/${diffId}`;
  if (setId) return `https://osu.ppy.sh/beatmapsets/${setId}`;
  return null;
}

// ──────────────────────────────────────────────────────────────
// Rank badge colors (osu!-style)
// ──────────────────────────────────────────────────────────────
const RANK_COLORS = {
  XH: { fg: "#e9f4ff", bg: "rgba(225,240,255,0.14)", bd: "rgba(225,240,255,0.35)" },
  X:  { fg: "#ffd76a", bg: "rgba(255,215,106,0.14)", bd: "rgba(255,215,106,0.45)" },
  SH: { fg: "#d6e8ff", bg: "rgba(214,232,255,0.10)", bd: "rgba(214,232,255,0.30)" },
  S:  { fg: "#ffd66a", bg: "rgba(255,214,106,0.12)", bd: "rgba(255,214,106,0.40)" },
  A:  { fg: "#a7e9a1", bg: "rgba(167,233,161,0.12)", bd: "rgba(167,233,161,0.40)" },
  B:  { fg: "#7abaff", bg: "rgba(122,186,255,0.12)", bd: "rgba(122,186,255,0.40)" },
  C:  { fg: "#c78dff", bg: "rgba(199,141,255,0.12)", bd: "rgba(199,141,255,0.40)" },
  D:  { fg: "#ff7b8a", bg: "rgba(255,123,138,0.12)", bd: "rgba(255,123,138,0.40)" },
  F:  { fg: "#9aa0a6", bg: "rgba(154,160,166,0.12)", bd: "rgba(154,160,166,0.40)" },
};

function RankPill({ rank }) {
  const key = (rank || "F").toUpperCase();
  const c = RANK_COLORS[key] || RANK_COLORS.F;
  const display = key === "XH" ? "SS" : key === "X" ? "SS" : key === "SH" ? "S" : key;
  const plus = key === "XH" || key === "SH";
  return (
    <span
      className="inline-flex items-center justify-center rounded-md text-[11px] font-black tabular-nums px-1.5 h-[22px] min-w-[32px] tracking-tight"
      style={{ color: c.fg, background: c.bg, border: `1px solid ${c.bd}` }}
    >
      {display}
      {plus && <span className="ml-[1px] opacity-80 text-[9px]">+</span>}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────
// Country flag (emoji or ISO-2 → twemoji-ish render via characters)
// ──────────────────────────────────────────────────────────────
function FlagMark({ cc }) {
  if (!cc || cc.length !== 2) return null;
  const upper = cc.toUpperCase();
  const chars = Array.from(upper).map((c) =>
    String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)
  );
  return (
    <span className="text-[12px] leading-none" title={upper}>
      {chars.join("")}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────
// Mods row (compact pills)
// ──────────────────────────────────────────────────────────────
const MOD_TINT = {
  HD: "#ffd66a",
  HR: "#ff7b8a",
  DT: "#9ac1ff",
  NC: "#a8d4ff",
  FL: "#e0c47a",
  EZ: "#a7e9a1",
  HT: "#b0b6bd",
  NF: "#9aa0a6",
  SD: "#ff9eb0",
  PF: "#ffc488",
  SO: "#c78dff",
  RX: "#ff9eb0",
  AP: "#ff9eb0",
  TD: "#9aa0a6",
};
function ModRow({ mods }) {
  if (!Array.isArray(mods) || mods.length === 0)
    return <span className="text-[10.5px] text-white/30">NoMod</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {mods.slice(0, 6).map((m) => (
        <span
          key={m}
          className="inline-block rounded px-1 py-[1px] text-[10px] font-bold tracking-wider"
          style={{
            color: MOD_TINT[m] || "#fff",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {m}
        </span>
      ))}
      {mods.length > 6 && (
        <span className="text-[10px] text-white/40">+{mods.length - 6}</span>
      )}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────
// Row
// ──────────────────────────────────────────────────────────────
function ScoreRow({ score, idx, accent = "#ff66aa", diffId, onOpen }) {
  const ppNum = Number.isFinite(score.pp) && score.pp > 0 ? Math.round(score.pp) : null;
  const ppDisplay = ppNum != null ? ppNum.toLocaleString("en-US") : null;
  const acc = score.accuracy != null ? (score.accuracy * 100).toFixed(2) : null;
  const scoreUrl = osuScoreUrl(score, diffId);
  const topIcon =
    idx === 0 ? (
      <Crown size={12} strokeWidth={2} className="text-[#ffd76a]" />
    ) : idx === 1 ? (
      <Medal size={12} strokeWidth={2} className="text-[#e6e6e6]" />
    ) : idx === 2 ? (
      <Award size={12} strokeWidth={2} className="text-[#e3a06a]" />
    ) : null;

  return (
    <button
      type="button"
      onClick={() => onOpen && onOpen(score, idx)}
      title="Voir la performance"
      className="group flex items-center gap-1.5 @sm:gap-2 px-1.5 @sm:px-2 py-1.5 rounded-md border border-transparent hover:border-white/10 hover:bg-white/[0.04] transition-colors cursor-pointer text-left w-full"
      data-testid={`leaderboard-row-${idx + 1}`}
    >
      {/* Position */}
      <div className="flex items-center justify-center shrink-0 w-[20px] @sm:w-[22px]">
        {topIcon || (
          <span className="text-[10.5px] @sm:text-[11px] text-white/45 tabular-nums font-semibold">
            {idx + 1}
          </span>
        )}
      </div>

      {/* Rank */}
      <RankPill rank={score.rank} />

      {/* Avatar — hidden on very narrow containers */}
      <span
        className="hidden @[260px]:flex h-[22px] w-[22px] shrink-0 rounded-full overflow-hidden bg-white/[0.06] border border-white/10 items-center justify-center text-white/45"
      >
        {score.user?.avatar_url ? (
          <img
            src={score.user.avatar_url}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <User size={11} strokeWidth={1.6} />
        )}
      </span>

      {/* Username + flag */}
      <span
        className="min-w-0 flex-1 flex items-center gap-1 @sm:gap-1.5"
        title={score.user?.username}
      >
        <span className="hidden @[200px]:inline">
          <FlagMark cc={score.user?.country_code} />
        </span>
        <span className="truncate text-[11.5px] @sm:text-[12px] font-semibold text-white/90 group-hover:text-white">
          {score.user?.username || "—"}
        </span>
      </span>

      {/* Accuracy */}
      <span className="hidden @[340px]:inline shrink-0 text-[11px] text-white/55 tabular-nums">
        {acc ? `${acc}%` : "—"}
      </span>

      {/* Mods */}
      <span className="hidden @[440px]:inline shrink-0">
        <ModRow mods={score.mods} />
      </span>

      {/* PP / score */}
      <span
        className="text-[11px] @sm:text-[11.5px] font-bold tabular-nums shrink-0 min-w-[44px] @sm:min-w-[58px] text-right"
        style={{ color: ppNum ? accent : "rgba(255,255,255,0.45)" }}
        title={
          ppNum != null
            ? `${ppNum} pp`
            : `${(score.total_score || 0).toLocaleString("en-US")} points`
        }
      >
        {ppDisplay != null ? (
          <>
            {ppDisplay}
            <span className="ml-[1px] text-white/55 font-semibold">pp</span>
          </>
        ) : (
          formatCount(score.total_score || 0)
        )}
      </span>

      {/* External link */}
      {scoreUrl && (
        <span
          role="link"
          tabIndex={0}
          title="Ouvrir sur osu.ppy.sh"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            window.open(scoreUrl, "_blank", "noopener,noreferrer");
          }}
          className="hidden @[300px]:inline shrink-0 text-white/25 group-hover:text-white/70 transition-colors"
        >
          <ExternalLink size={11} strokeWidth={2} />
        </span>
      )}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────
export default function Leaderboard({ diffId, setId, status, beatmap, diff, accent = "#ff66aa" }) {
  const [source, setSource] = useState("osu"); // "osu" | "osuweb"
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [restricted, setRestricted] = useState(false);
  const [modalScore, setModalScore] = useState(null);
  const [modalIdx, setModalIdx] = useState(-1);
  const reqRef = useRef(0);

  // Only these osu! statuses have a global leaderboard that counts scores.
  // Anything else (pending / wip / graveyard) → no scores exist on osu.ppy.sh.
  const RANKED_STATUSES = ["ranked", "approved", "qualified", "loved"];
  const isLeaderboardEligible =
    !status || RANKED_STATUSES.includes(String(status).toLowerCase());

  useEffect(() => {
    // reset state when diff or source changes
    setScores([]);
    setError(null);
    setRestricted(false);
    if (!diffId) return;
    if (source !== "osu") {
      // osu!Web local leaderboard is not backed yet → empty, no loading.
      return;
    }
    if (!isLeaderboardEligible) {
      // Don't even query osu! for maps that can't have global scores.
      return;
    }
    const reqId = ++reqRef.current;
    setLoading(true);
    fetchBeatmapScores(diffId, { limit: 50 })
      .then((data) => {
        if (reqId !== reqRef.current) return;
        setScores(Array.isArray(data.items) ? data.items : []);
        setRestricted(Boolean(data.restricted));
      })
      .catch((e) => {
        if (reqId !== reqRef.current) return;
        setScores([]);
        setError(
          e?.response?.status === 404
            ? "Pas de classement pour cette difficulté."
            : "Impossible de charger le classement."
        );
      })
      .finally(() => {
        if (reqId === reqRef.current) setLoading(false);
      });
  }, [diffId, source, isLeaderboardEligible]);

  const sourceTabs = (
    <div
      className="flex items-center gap-1 @sm:gap-1.5 p-1 rounded-full border border-white/10 bg-black/50 backdrop-blur-xl w-fit"
      data-testid="leaderboard-source-tabs"
      role="tablist"
    >
      <SourceButton
        active={source === "osu"}
        onClick={() => setSource("osu")}
        accent={accent}
        testid="leaderboard-tab-osu"
        icon={<Globe2 size={11} strokeWidth={2} />}
      >
        <span className="font-black tracking-tight">osu<span style={{ color: accent }}>!</span></span>
      </SourceButton>
      <SourceButton
        active={source === "osuweb"}
        onClick={() => setSource("osuweb")}
        accent={accent}
        testid="leaderboard-tab-osuweb"
        icon={<Sparkles size={11} strokeWidth={2} />}
      >
        <span className="font-black tracking-tight">
          osu<span style={{ color: accent }}>!</span>
          <span className="text-white/55 font-semibold ml-[1px]">Web</span>
        </span>
      </SourceButton>
    </div>
  );

  const header = (
    <div
      className="flex items-center gap-2 mb-2"
      data-testid="leaderboard-header"
    >
      <span
        className="h-[6px] w-[6px] rounded-full shrink-0"
        style={{
          background: accent,
          boxShadow: `0 0 10px ${accent}, 0 0 3px ${accent}`,
        }}
      />
      <span className="text-[9.5px] @sm:text-[10px] uppercase tracking-[0.28em] @sm:tracking-[0.36em] text-white/40 inline-flex items-center gap-1 @sm:gap-1.5 truncate">
        <Trophy size={11} strokeWidth={1.8} className="shrink-0" />
        <span className="truncate">
          Classement
          <span className="text-white/25 mx-1">·</span>
          <span className="text-white/55">
            {source === "osu" ? "Global" : "osu!Web"}
          </span>
        </span>
      </span>

      <span className="ml-auto text-[9.5px] @sm:text-[10px] uppercase tracking-[0.22em] @sm:tracking-[0.26em] text-white/30 tabular-nums shrink-0">
        {source === "osu" && !isLeaderboardEligible
          ? (status || "unranked")
          : loading
          ? "…"
          : `${scores.length} score${scores.length > 1 ? "s" : ""}`}
      </span>
    </div>
  );

  const body = useMemo(() => {
    if (!diffId) {
      return (
        <div className="text-[11.5px] text-white/35 italic px-1 py-2">
          Sélectionne une difficulté pour voir le classement.
        </div>
      );
    }
    if (source === "osu" && !isLeaderboardEligible) {
      const label = (status || "unranked").toString().toLowerCase();
      return (
        <div
          className="flex flex-col items-center justify-center gap-1.5 text-center px-3 py-6 rounded-md border border-white/10 bg-white/[0.02]"
          data-testid="leaderboard-unranked"
        >
          <Trophy size={16} strokeWidth={1.4} className="text-white/30" />
          <p className="text-[12px] text-white/60 font-medium">
            Pas de classement global
          </p>
          <p className="text-[11px] text-white/40 max-w-[300px] leading-snug">
            Les maps <span className="text-white/70 capitalize">{label}</span> ne sont pas comptabilisées sur osu!.
            Seules les maps <span className="text-white/70">ranked</span>,
            <span className="text-white/70"> approved</span>,
            <span className="text-white/70"> qualified</span> ou
            <span className="text-white/70"> loved</span> possèdent un leaderboard.
          </p>
        </div>
      );
    }
    if (source === "osuweb") {
      return (
        <div
          className="flex flex-col items-center justify-center gap-1.5 text-center px-2 py-8 rounded-md border border-dashed border-white/10 bg-white/[0.015]"
          data-testid="leaderboard-osuweb-empty"
        >
          <Sparkles size={18} strokeWidth={1.4} className="text-white/30" />
          <p className="text-[12px] text-white/55 font-medium">
            Classement osu!Web
          </p>
          <p className="text-[11px] text-white/35 max-w-[280px] leading-snug">
            Aucun score local pour le moment. Joue une map pour apparaître ici.
          </p>
        </div>
      );
    }
    if (loading) {
      return (
        <div className="space-y-1.5" data-testid="leaderboard-loading">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[34px] rounded-md border border-white/[0.06] bg-white/[0.03] animate-pulse"
            />
          ))}
        </div>
      );
    }
    if (error) {
      return (
        <div className="text-[11.5px] text-white/45 px-1 py-2" data-testid="leaderboard-error">
          {error}
        </div>
      );
    }
    if (restricted) {
      return (
        <div className="text-[11.5px] text-white/45 px-1 py-2" data-testid="leaderboard-restricted">
          Classement non disponible via l'API publique pour cette difficulté.
        </div>
      );
    }
    if (!scores.length) {
      return (
        <div className="text-[11.5px] text-white/45 px-1 py-2" data-testid="leaderboard-empty">
          Aucun score enregistré pour cette difficulté.
        </div>
      );
    }
    return (
      <div
        className="flex flex-col gap-[2px] max-h-[32vh] md:max-h-[38vh] xl:max-h-[44vh] overflow-y-auto pr-1 scroll-thin"
        data-testid="leaderboard-list"
        data-lenis-prevent
      >
        {scores.map((s, i) => (
          <ScoreRow
            key={s.id || i}
            score={s}
            idx={i}
            accent={accent}
            diffId={diffId}
            onOpen={(sc, idx) => { setModalScore(sc); setModalIdx(idx); }}
          />
        ))}
      </div>
    );
  }, [diffId, source, loading, error, restricted, scores, accent, isLeaderboardEligible, status]);

  return (
    <>
      <section
        className="@container rounded-2xl border border-white/10 bg-black/45 backdrop-blur-xl px-3 @sm:px-4 py-3 @sm:py-3.5"
        data-testid="solo-leaderboard"
      >
        <div className="mb-2 @sm:mb-2.5">{sourceTabs}</div>
        {header}
        {body}
      </section>
      <PerformanceModal
        open={!!modalScore}
        onOpenChange={(v) => { if (!v) { setModalScore(null); setModalIdx(-1); } }}
        score={modalScore}
        beatmap={beatmap}
        diff={diff}
        rankIndex={modalIdx}
        osuScoreUrl={modalScore ? osuScoreUrl(modalScore, diffId) : null}
        osuUserUrl={modalScore ? osuUserUrl(modalScore.user?.id) : null}
      />
    </>
  );
}

// Small tab button used at the top of the leaderboard.
function SourceButton({ active, onClick, accent, children, icon, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active ? "true" : "false"}
      data-testid={testid}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] transition-all duration-200 border ${
        active
          ? "text-white border-white/25 bg-white/[0.06]"
          : "text-white/55 border-transparent hover:text-white/85 hover:bg-white/[0.04]"
      }`}
      style={
        active
          ? {
              boxShadow: `inset 0 0 0 1px ${accent}33, 0 0 18px ${accent}22`,
            }
          : undefined
      }
    >
      <span
        className={`inline-flex items-center justify-center ${
          active ? "" : "opacity-70"
        }`}
        style={active ? { color: accent } : undefined}
      >
        {icon}
      </span>
      {children}
    </button>
  );
}
