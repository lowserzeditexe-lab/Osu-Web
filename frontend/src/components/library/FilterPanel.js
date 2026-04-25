import React, { useState } from "react";
import { SlidersHorizontal, X, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const GENRES = [
  "Video Game", "Anime", "Rock", "Pop", "Other", "Novelty",
  "Hip Hop", "Electronic", "Metal", "Classical", "Folk", "Jazz"
];

const LANGUAGES = [
  "English", "Japanese", "Chinese", "Instrumental", "Korean",
  "French", "German", "Swedish", "Spanish", "Italian", "Russian", "Polish"
];

function NativeSelect({ value, onChange, options, placeholder, accentColor }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-[13px] text-white appearance-none focus:outline-none focus:border-white/25 transition-colors cursor-pointer"
      >
        <option value="" className="bg-black text-white/60">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o} className="bg-[#111] text-white">{o}</option>
        ))}
      </select>
      <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
    </div>
  );
}

function RangeInputs({ label, min, max, onMin, onMax, step = 1 }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.25em] text-white/40 mb-2">{label}</p>
      <div className="flex gap-2">
        <input
          type="number"
          value={min}
          onChange={(e) => onMin(e.target.value)}
          placeholder="Min"
          step={step}
          min={0}
          className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-[13px] text-white placeholder-white/25 focus:outline-none focus:border-white/25 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <input
          type="number"
          value={max}
          onChange={(e) => onMax(e.target.value)}
          placeholder="Max"
          step={step}
          min={0}
          className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-[13px] text-white placeholder-white/25 focus:outline-none focus:border-white/25 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>
    </div>
  );
}

const EMPTY_FILTERS = { genre: "", language: "", bpm_min: "", bpm_max: "", diff_min: "", diff_max: "" };

export { EMPTY_FILTERS };

export default function FilterPanel({ filters, onChange }) {
  const [open, setOpen] = useState(false);

  const activeCount = [
    filters.genre, filters.language,
    filters.bpm_min, filters.bpm_max,
    filters.diff_min, filters.diff_max
  ].filter(Boolean).length;

  function clear() {
    onChange({ ...EMPTY_FILTERS });
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] uppercase tracking-[0.22em] transition-colors ${
            open || activeCount > 0
              ? "border-white/35 bg-white/[0.08] text-white"
              : "border-white/10 bg-white/[0.04] text-white/70 hover:text-white hover:border-white/25"
          }`}
        >
          <SlidersHorizontal size={13} strokeWidth={1.6} />
          Filtres
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-[#b388ff] text-black text-[9px] font-bold">
              {activeCount}
            </span>
          )}
          <ChevronDown
            size={13}
            strokeWidth={1.6}
            className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-white/55 hover:text-white hover:border-white/25 transition-colors"
          >
            <X size={12} />
            Reset
          </button>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            key="filter-panel"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-full left-0 mt-3 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-[#0a0a0a]/95 backdrop-blur-2xl p-5 shadow-2xl z-30 space-y-4"
          >
            {/* Genre + Language */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/40 mb-2">Genre</p>
                <NativeSelect
                  value={filters.genre}
                  onChange={(v) => onChange({ ...filters, genre: v })}
                  options={GENRES}
                  placeholder="Tous"
                />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/40 mb-2">Langue</p>
                <NativeSelect
                  value={filters.language}
                  onChange={(v) => onChange({ ...filters, language: v })}
                  options={LANGUAGES}
                  placeholder="Toutes"
                />
              </div>
            </div>

            {/* Difficulty range */}
            <RangeInputs
              label="Difficulté ★"
              min={filters.diff_min}
              max={filters.diff_max}
              onMin={(v) => onChange({ ...filters, diff_min: v })}
              onMax={(v) => onChange({ ...filters, diff_max: v })}
              step={0.5}
            />

            {/* BPM range */}
            <RangeInputs
              label="BPM"
              min={filters.bpm_min}
              max={filters.bpm_max}
              onMin={(v) => onChange({ ...filters, bpm_min: v })}
              onMax={(v) => onChange({ ...filters, bpm_max: v })}
            />

            <p className="text-[10px] text-white/30 text-right">
              Les filtres s'appliquent sur le pool en cache (jusqu'à 300 maps)
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
