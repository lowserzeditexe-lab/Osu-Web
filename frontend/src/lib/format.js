// Utilities to format beatmap metadata for the UI.

export function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatCount(n) {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (abs >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return n.toString();
}

// Osu!-style color buckets for star rating.
export function difficultyColor(d) {
  if (!Number.isFinite(d)) return "#9aa0a6";
  if (d < 2) return "#66e3a6";   // easy
  if (d < 2.7) return "#66c6ff"; // normal
  if (d < 4) return "#f6d365";   // hard
  if (d < 5.3) return "#ff8aa7"; // insane
  if (d < 6.5) return "#c77dff"; // expert
  if (d < 7.5) return "#ff4d6d"; // expert+
  return "#e0e0e0";              // ultra
}

export function difficultyLabel(d) {
  if (!Number.isFinite(d)) return "—";
  if (d < 2) return "Easy";
  if (d < 2.7) return "Normal";
  if (d < 4) return "Hard";
  if (d < 5.3) return "Insane";
  if (d < 6.5) return "Expert";
  if (d < 7.5) return "Expert+";
  return "Ultra";
}
