import React from "react";
import { Star } from "lucide-react";
import { difficultyColor } from "@/lib/format";

const MODE_ICON = { osu: "●", taiko: "drum", fruits: "◆", mania: "≡" };

export default function DiffPicker({ difficulties, selectedDiff, onSelect }) {
  if (!difficulties || difficulties.length === 0) return null;

  const sorted = [...difficulties].sort((a, b) => a.difficulty_rating - b.difficulty_rating);

  return (
    <div className="flex flex-wrap gap-1.5">
      {sorted.map((diff) => {
        const color = difficultyColor(diff.difficulty_rating);
        const active = selectedDiff?.id === diff.id;
        return (
          <button
            key={diff.id}
            type="button"
            onClick={() => onSelect(diff)}
            title={diff.version}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] transition-all ${
              active
                ? "text-black font-semibold scale-105"
                : "border border-white/10 bg-white/[0.04] text-white/65 hover:text-white hover:border-white/25"
            }`}
            style={active ? { background: color, boxShadow: `0 0 12px ${color}66` } : {}}
          >
            <Star
              size={10}
              fill={active ? "black" : color}
              stroke={active ? "black" : color}
              strokeWidth={0}
            />
            <span className="max-w-[90px] truncate">{diff.version}</span>
            <span className={active ? "text-black/70" : ""} style={!active ? { color } : {}}>
              {diff.difficulty_rating.toFixed(1)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
