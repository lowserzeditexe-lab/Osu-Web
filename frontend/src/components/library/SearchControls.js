import React from "react";

// osu-style tabs for Mode / Status / Sort — matching
// https://osu.ppy.sh/beatmapsets header layout.

export const MODES = [
  { key: "osu",    label: "osu!",   accent: "#ff66aa" },
  { key: "taiko",  label: "taiko",  accent: "#ff9f68" },
  { key: "fruits", label: "catch",  accent: "#a3f78a" },
  { key: "mania",  label: "mania",  accent: "#a4c6ff" },
];

export const STATUSES = [
  { key: "ranked",    label: "Ranked" },
  { key: "qualified", label: "Qualified" },
  { key: "loved",     label: "Loved" },
  { key: "pending",   label: "Pending" },
  { key: "wip",       label: "WIP" },
  { key: "graveyard", label: "Graveyard" },
  { key: "any",       label: "Any" },
];

export const SORTS = [
  { key: "relevance",         label: "Relevance" },
  { key: "title_asc",         label: "Title (A→Z)" },
  { key: "artist_asc",        label: "Artist (A→Z)" },
  { key: "difficulty_desc",   label: "Difficulty (high → low)" },
  { key: "difficulty_asc",    label: "Difficulty (low → high)" },
  { key: "ranked_desc",       label: "Ranked (newest)" },
  { key: "ranked_asc",        label: "Ranked (oldest)" },
  { key: "updated_desc",      label: "Updated (newest)" },
  { key: "plays_desc",        label: "Plays (most)" },
  { key: "favourites_desc",   label: "Favourites (most)" },
  { key: "rating_desc",       label: "Rating (highest)" },
];

export function ModeTabs({ value, onChange, dataPrefix = "library-mode" }) {
  return (
    <div
      className="inline-flex items-center gap-1 p-1 rounded-full border border-white/10 bg-black/35 backdrop-blur-xl"
      role="tablist"
      data-testid={`${dataPrefix}-tabs`}
    >
      {MODES.map((m) => {
        const active = m.key === value;
        return (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m.key)}
            data-testid={`${dataPrefix}-${m.key}`}
            className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition-all ${
              active
                ? "text-black"
                : "text-white/60 hover:text-white"
            }`}
            style={
              active
                ? {
                    background: m.accent,
                    boxShadow: `0 0 16px ${m.accent}55`,
                  }
                : undefined
            }
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

export function StatusChips({ value, onChange, dataPrefix = "library-status" }) {
  return (
    <div
      className="flex items-center gap-1.5 flex-wrap"
      role="tablist"
      data-testid={`${dataPrefix}-chips`}
    >
      {STATUSES.map((s) => {
        const active = s.key === value;
        return (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(s.key)}
            data-testid={`${dataPrefix}-${s.key}`}
            className={`inline-flex items-center rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] font-semibold border transition-colors ${
              active
                ? "text-white border-[#b388ff]/70 bg-[#b388ff]/15"
                : "text-white/55 border-white/10 bg-white/[0.03] hover:text-white hover:border-white/25"
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

export function SortSelect({ value, onChange, disableRelevance = false }) {
  const current = SORTS.find((s) => s.key === value) || SORTS[0];
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const options = disableRelevance
    ? SORTS.filter((s) => s.key !== "relevance")
    : SORTS;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="library-sort-toggle"
        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] px-3.5 py-1.5 text-[11px] uppercase tracking-[0.18em] text-white/75 hover:text-white transition-colors"
      >
        <span className="text-white/40">Sort:</span>
        <span className="font-semibold">{current.label}</span>
        <svg width="10" height="10" viewBox="0 0 12 12" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-2 min-w-[240px] rounded-xl border border-white/10 bg-black/95 backdrop-blur-xl p-1 shadow-2xl z-[60]"
          data-testid="library-sort-menu"
        >
          {options.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => { onChange(s.key); setOpen(false); }}
              data-testid={`library-sort-${s.key}`}
              className={`w-full text-left rounded-lg px-3 py-2 text-[12px] transition-colors ${
                s.key === value
                  ? "bg-white/[0.08] text-white"
                  : "text-white/70 hover:bg-white/[0.05] hover:text-white"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
