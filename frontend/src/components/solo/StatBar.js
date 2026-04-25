import React from "react";
import { MOD_DEFS } from "@/lib/mods";

/**
 * Compact stat bar for a single osu! stat (CS/AR/OD/HP).
 * Shows the base value and, when mods change it, the new value with a
 * colored delta arrow. Bar fill animates between base and modified value.
 */
export default function StatBar({
  label,
  base,
  value,
  accent = "#b388ff",
  max = 10,
}) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <div
        className="flex items-center gap-2"
        data-testid={`solo-stat-${label.toLowerCase()}`}
      >
        <span className="w-8 text-[10px] uppercase tracking-[0.22em] text-white/40 font-semibold">
          {label}
        </span>
        <span className="flex-1 h-[4px] rounded-full bg-white/[0.06]" />
        <span className="text-[11px] text-white/30 tabular-nums w-10 text-right">
          —
        </span>
      </div>
    );
  }

  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const basePct =
    base != null
      ? Math.max(0, Math.min(100, (base / max) * 100))
      : pct;
  const delta = base != null ? value - base : 0;
  const up = delta > 0.05;
  const down = delta < -0.05;
  const deltaColor = up ? "#ff7b8a" : down ? "#66e3a6" : "rgba(255,255,255,0.4)";

  return (
    <div
      className="flex items-center gap-2.5"
      data-testid={`solo-stat-${label.toLowerCase()}`}
    >
      <span className="w-8 text-[10px] uppercase tracking-[0.22em] text-white/50 font-semibold">
        {label}
      </span>
      <div className="relative flex-1 h-[5px] rounded-full bg-white/[0.07] overflow-hidden">
        {/* ghost of the base value */}
        {base != null && basePct !== pct && (
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${basePct}%`,
              background: "rgba(255,255,255,0.15)",
            }}
          />
        )}
        {/* actual value */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width,background] duration-300"
          style={{
            width: `${pct}%`,
            background: up
              ? "#ff7b8a"
              : down
              ? "#66e3a6"
              : accent,
            boxShadow: `0 0 10px ${
              up ? "#ff7b8a" : down ? "#66e3a6" : accent
            }55`,
          }}
        />
      </div>
      <span
        className="text-[11.5px] tabular-nums w-16 text-right font-semibold"
        style={{ color: up || down ? deltaColor : "rgba(255,255,255,0.85)" }}
      >
        {value.toFixed(1)}
        {Math.abs(delta) >= 0.05 && (
          <span className="ml-1 text-[9.5px] font-normal opacity-80">
            {up ? "▲" : "▼"}
            {Math.abs(delta).toFixed(1)}
          </span>
        )}
      </span>
    </div>
  );
}

// Re-export MOD_DEFS for convenience if something else imports from here.
export { MOD_DEFS };
