import React from "react";

const MODS = [
  { key: "NF", label: "No Fail",     color: "#aaaaaa", group: "difficulty" },
  { key: "EZ", label: "Easy",        color: "#66cc66", group: "difficulty" },
  { key: "HT", label: "Half Time",   color: "#ffaa55", group: "speed" },
  { key: "HD", label: "Hidden",      color: "#ffdd00", group: "visual" },
  { key: "HR", label: "Hard Rock",   color: "#ff5555", group: "difficulty" },
  { key: "DT", label: "Double Time", color: "#5599ff", group: "speed" },
  { key: "FL", label: "Flashlight",  color: "#9966ff", group: "visual" },
  { key: "SO", label: "Spun Out",    color: "#ff99cc", group: "fun" },
  { key: "RX", label: "Relax",       color: "#55ffaa", group: "fun" },
  { key: "AT", label: "Auto",        color: "#ffffff", group: "fun" },
];

export default function ModPicker({ mods, onToggle }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {MODS.map((mod) => {
        const active = mods.has(mod.key);
        return (
          <button
            key={mod.key}
            type="button"
            onClick={() => onToggle(mod.key)}
            title={mod.label}
            className={`inline-flex items-center justify-center w-10 h-10 rounded-xl text-[12px] font-bold tracking-wide transition-all duration-150 ${
              active
                ? "scale-105 text-black"
                : "border border-white/10 bg-white/[0.04] text-white/50 hover:text-white hover:border-white/25"
            }`}
            style={active ? { background: mod.color, boxShadow: `0 0 14px ${mod.color}88` } : {}}
          >
            {mod.key}
          </button>
        );
      })}
    </div>
  );
}
