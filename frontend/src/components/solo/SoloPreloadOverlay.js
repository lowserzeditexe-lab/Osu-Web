import React from "react";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * SoloPreloadOverlay — full-screen "installing songs" loading screen shown
 * before the Solo song-select UI becomes interactive. We download every
 * popular beatmap's .osz audio up-front so that clicking a song produces
 * instant playback (no network wait, no .osz parse on click).
 *
 * Mimics the look of an in-game map loading screen: dark scrim, big
 * progress bar in the center, a couple of status lines below.
 *
 * Props:
 *  - total:    total number of beatmaps to install
 *  - done:     number successfully installed so far (incl. failures)
 *  - failed:   array of { id, title, error } for maps that errored out
 *  - currentTitle: title of the map currently being downloaded (or null)
 *  - phase:    "fetching" | "preloading" | "done"
 */
export default function SoloPreloadOverlay({
  total,
  done,
  failed,
  currentTitle,
  phase,
}) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const pct = Math.round(ratio * 100);
  const succeeded = Math.max(0, done - failed.length);

  return (
    <div
      data-testid="solo-preload-overlay"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 backdrop-blur-2xl"
    >
      {/* Subtle radial glow behind the content */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(255,102,170,0.10) 0%, transparent 55%)",
        }}
      />

      <div className="relative z-[1] w-full max-w-[640px] px-10 flex flex-col items-center">
        {/* osu! logo */}
        <div className="select-none mb-12 flex items-end gap-2">
          <span className="text-[40px] font-semibold tracking-tight text-white leading-none">
            osu<span className="text-[#ff66aa]">!</span>
          </span>
          <span className="text-[12px] uppercase tracking-[0.32em] text-white/45 pb-[6px]">
            web
          </span>
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          {phase === "done" ? (
            <CheckCircle2 size={18} className="text-[#66e88e]" strokeWidth={2} />
          ) : (
            <Loader2 size={18} className="animate-spin text-white/70" strokeWidth={2} />
          )}
          <h2 className="text-[13px] uppercase tracking-[0.28em] text-white/80 font-semibold">
            {phase === "fetching" && "Récupération des maps…"}
            {phase === "preloading" && "Installation des musiques"}
            {phase === "done" && "Installation terminée"}
          </h2>
        </div>

        {/* Big counter */}
        <div className="text-[44px] font-semibold tracking-tight text-white tabular-nums leading-none mb-2">
          {done}<span className="text-white/30"> / {total || "—"}</span>
        </div>
        <div className="text-[10.5px] uppercase tracking-[0.24em] text-white/45 mb-8">
          {phase === "preloading" && currentTitle
            ? `En cours · ${currentTitle}`
            : phase === "done"
            ? `${succeeded} installées${failed.length > 0 ? ` · ${failed.length} échec${failed.length > 1 ? "s" : ""}` : ""}`
            : "Préparation…"}
        </div>

        {/* Progress bar */}
        <div
          className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden mb-2"
          data-testid="solo-preload-bar"
        >
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-out"
            style={{
              width: `${pct}%`,
              background:
                "linear-gradient(90deg, #ff66aa 0%, #ff8c69 60%, #f5d76e 100%)",
              boxShadow: "0 0 16px rgba(255,102,170,0.5)",
            }}
          />
        </div>
        <div className="w-full flex justify-between text-[9.5px] uppercase tracking-[0.22em] text-white/35 tabular-nums">
          <span>{pct}%</span>
          <span>
            {phase === "done" ? "Terminé" : `${total - done} restant${total - done > 1 ? "s" : ""}`}
          </span>
        </div>

        {/* Failed list */}
        {failed.length > 0 && (
          <div
            className="mt-8 w-full rounded-2xl border border-[#ff8c69]/20 bg-[#ff8c69]/[0.05] backdrop-blur-md px-5 py-4"
            data-testid="solo-preload-failed"
          >
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={14} className="text-[#ff8c69]" strokeWidth={1.8} />
              <span className="text-[10.5px] uppercase tracking-[0.22em] text-[#ff8c69] font-semibold">
                {failed.length} map{failed.length > 1 ? "s" : ""} non disponible{failed.length > 1 ? "s" : ""}
              </span>
            </div>
            <ul className="space-y-1 max-h-[140px] overflow-y-auto pr-2">
              {failed.slice(0, 12).map((f) => (
                <li
                  key={f.id}
                  className="flex items-baseline gap-2 text-[11px] text-white/55"
                  data-testid={`solo-preload-failed-${f.id}`}
                >
                  <span className="truncate flex-1">{f.title || `Set ${f.id}`}</span>
                  <span className="text-[9.5px] text-white/30 tabular-nums flex-shrink-0">
                    {f.error || "erreur"}
                  </span>
                </li>
              ))}
              {failed.length > 12 && (
                <li className="text-[10px] text-white/30 italic">
                  … et {failed.length - 12} autre{failed.length - 12 > 1 ? "s" : ""}
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
