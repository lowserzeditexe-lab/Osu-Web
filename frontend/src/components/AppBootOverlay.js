import React from "react";

/**
 * AppBootOverlay — minimal full-screen loading screen shown at game launch
 * while we install all the beatmap audio. Three pieces only, stacked
 * vertically: osu! logo, a thin progress bar, and a one-line status label.
 *
 * Props:
 *  - phase: "fetching" | "downloading" | "verifying" | "done"
 *  - total: total beatmaps known
 *  - done:  beatmaps processed (success or fail)
 */
export default function AppBootOverlay({ phase, total, done }) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const pct = Math.round(ratio * 100);

  let status = "";
  if (phase === "fetching") status = "Vérification";
  else if (phase === "downloading") status = `Téléchargement des beatmaps · ${done}/${total}`;
  else if (phase === "verifying") status = "Vérification des maps manquantes…";
  else status = "Prêt";

  return (
    <div
      data-testid="app-boot-overlay"
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black"
    >
      {/* Subtle radial vignette so the bar pops on pure black */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(255,102,170,0.08) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-[1] w-full max-w-[520px] px-10 flex flex-col items-center">
        {/* Logo */}
        <div className="select-none flex items-end gap-2 mb-12">
          <span className="text-[44px] font-semibold tracking-tight text-white leading-none">
            osu<span className="text-[#ff66aa]">!</span>
          </span>
          <span className="text-[12px] uppercase tracking-[0.32em] text-white/45 pb-[7px]">
            web
          </span>
        </div>

        {/* Progress bar */}
        <div
          className="w-full h-[3px] rounded-full bg-white/[0.07] overflow-hidden"
          data-testid="app-boot-bar"
        >
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-out"
            style={{
              width: phase === "fetching" ? "8%" : `${pct}%`,
              background:
                "linear-gradient(90deg, #ff66aa 0%, #ff8c69 60%, #f5d76e 100%)",
              boxShadow: "0 0 14px rgba(255,102,170,0.55)",
            }}
          />
        </div>

        {/* Status */}
        <div
          className="mt-5 text-[11px] uppercase tracking-[0.26em] text-white/55 font-semibold"
          data-testid="app-boot-status"
        >
          {status}
        </div>
      </div>
    </div>
  );
}
