import React, { useEffect } from "react";
import { X } from "lucide-react";
import { MOD_DEFS, MOD_ORDER, totalMultiplier } from "@/lib/mods";

/**
 * Full-screen, centered modal showing every osu! mod as a large tile
 * with icon, full name, description and active state. Used from the
 * Solo detail panel "Mods" button next to Play.
 */
export default function ModsModal({ open, onClose, mods, onToggle, accent = "#b388ff" }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const mult = totalMultiplier(mods);
  const multColor =
    mult > 1.001 ? "#66e3a6" : mult < 0.999 ? "#ff7b8a" : accent;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-6 animate-in fade-in duration-200"
      data-testid="solo-mods-modal"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-md cursor-default"
        data-testid="solo-mods-backdrop"
      />

      {/* Panel */}
      <div
        className="relative z-[1] w-full max-w-[1040px] max-h-[86vh] overflow-y-auto rounded-[28px] border border-white/10 bg-[#0a0a0c]/90 backdrop-blur-2xl shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)] animate-in slide-in-from-bottom-4 duration-300"
        style={{ boxShadow: `0 40px 120px -20px ${accent}33` }}
      >
        {/* Header */}
        <div className="sticky top-0 z-[2] flex items-center justify-between gap-4 px-8 py-5 border-b border-white/[0.07] bg-[#0a0a0c]/85 backdrop-blur-xl rounded-t-[28px]">
          <div>
            <p className="text-[10px] uppercase tracking-[0.36em] text-white/40">
              Mod Select
            </p>
            <h2 className="mt-1 text-[26px] font-black tracking-tight text-white">
              Choisis tes mods
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div
              className="flex items-baseline gap-1.5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2"
              data-testid="solo-mods-multiplier"
            >
              <span className="text-[10px] uppercase tracking-[0.22em] text-white/45">
                Score
              </span>
              <span
                className="text-[20px] font-black tabular-nums"
                style={{ color: multColor }}
              >
                ×{mult.toFixed(2)}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              data-testid="solo-mods-close"
              className="h-11 w-11 rounded-full border border-white/10 bg-white/[0.04] text-white/70 hover:text-white hover:border-white/25 transition-colors flex items-center justify-center"
              aria-label="Fermer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Mod rows */}
        <div className="px-8 py-7 space-y-7">
          {MOD_ORDER.map((row, idx) => (
            <div key={idx}>
              <div className="text-[10px] uppercase tracking-[0.32em] text-white/35 mb-3 pl-1">
                {rowLabel(idx)}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {row.map((key) => {
                  const def = MOD_DEFS[key];
                  if (!def) return null;
                  const active = mods.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onToggle(key)}
                      data-testid={`solo-mod-tile-${key}`}
                      aria-pressed={active}
                      className={`group relative overflow-hidden rounded-2xl border px-5 py-4 text-left transition-all duration-200 ${
                        active
                          ? "border-transparent scale-[1.02] text-black"
                          : "border-white/10 bg-white/[0.03] text-white/75 hover:text-white hover:border-white/25 hover:bg-white/[0.06]"
                      }`}
                      style={
                        active
                          ? {
                              background: def.color,
                              boxShadow: `0 14px 38px -12px ${def.color}aa`,
                            }
                          : {}
                      }
                    >
                      <div className="flex items-start gap-3">
                        {/* Large mod icon badge */}
                        <div
                          className={`flex-shrink-0 h-14 w-14 rounded-xl flex items-center justify-center text-[18px] font-black tracking-wide ${
                            active
                              ? "bg-black/15 text-black"
                              : "bg-white/[0.05] border border-white/10"
                          }`}
                          style={
                            !active
                              ? { color: def.color, borderColor: `${def.color}44` }
                              : {}
                          }
                        >
                          {def.key}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div
                            className={`text-[15px] font-bold leading-tight ${
                              active ? "text-black" : "text-white"
                            }`}
                          >
                            {def.full}
                          </div>
                          <div
                            className={`mt-1 text-[12px] leading-snug ${
                              active ? "text-black/70" : "text-white/55"
                            }`}
                          >
                            {def.desc}
                          </div>
                          <div
                            className={`mt-2 inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.16em] ${
                              active ? "text-black/80" : "text-white/45"
                            }`}
                          >
                            <span>×{def.multiplier.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function rowLabel(i) {
  return ["Difficulty Reduction", "Difficulty Increase", "Special"][i] || "";
}
