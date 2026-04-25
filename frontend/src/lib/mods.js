// osu!(std) mod definitions with score multiplier + stat modifiers.
// Note: exact osu!stable score multipliers. Lazer uses 1.0 for most,
// but the stable numbers are the most recognisable to players.

export const MOD_DEFS = {
  NF: {
    key: "NF",
    label: "No Fail",
    full: "No Fail",
    desc: "You can't fail, no matter what.",
    color: "#aaaaaa",
    multiplier: 0.5,
    group: "difficulty",
  },
  EZ: {
    key: "EZ",
    label: "Easy",
    full: "Easy",
    desc: "Reduces difficulty: larger circles, lower OD/AR/HP, 3 lives.",
    color: "#66cc66",
    multiplier: 0.5,
    group: "difficulty",
  },
  HT: {
    key: "HT",
    label: "Half Time",
    full: "Half Time",
    desc: "Slows the song to 75% speed.",
    color: "#ffaa55",
    multiplier: 0.3,
    group: "speed",
  },
  HD: {
    key: "HD",
    label: "Hidden",
    full: "Hidden",
    desc: "Notes fade out before you click them.",
    color: "#ffdd00",
    multiplier: 1.06,
    group: "visual",
  },
  HR: {
    key: "HR",
    label: "Hard Rock",
    full: "Hard Rock",
    desc: "Everything just got a bit harder.",
    color: "#ff5555",
    multiplier: 1.06,
    group: "difficulty",
  },
  DT: {
    key: "DT",
    label: "Double Time",
    full: "Double Time",
    desc: "Speeds the song up to 150%.",
    color: "#5599ff",
    multiplier: 1.12,
    group: "speed",
  },
  FL: {
    key: "FL",
    label: "Flashlight",
    full: "Flashlight",
    desc: "Restricts your field of vision.",
    color: "#9966ff",
    multiplier: 1.12,
    group: "visual",
  },
  SO: {
    key: "SO",
    label: "Spun Out",
    full: "Spun Out",
    desc: "Spinners will auto-complete.",
    color: "#ff99cc",
    multiplier: 0.9,
    group: "fun",
  },
  RX: {
    key: "RX",
    label: "Relax",
    full: "Relax",
    desc: "Auto-tapping — only aim matters.",
    color: "#55ffaa",
    multiplier: 0,
    group: "fun",
  },
  AT: {
    key: "AT",
    label: "Auto",
    full: "Autoplay",
    desc: "Watch a perfect play.",
    color: "#ffffff",
    multiplier: 0,
    group: "fun",
  },
};

// Order used in the selector modal (rows grouped like osu!).
export const MOD_ORDER = [
  ["EZ", "NF", "HT"],
  ["HR", "HD", "DT", "FL"],
  ["SO", "RX", "AT"],
];

const cap = (v, max = 10) => Math.min(max, Math.max(0, v));

// Approximate stat transformations (osu!stable semantics).
export function applyMods(base, modSet) {
  const mods = modSet instanceof Set ? modSet : new Set(modSet || []);
  if (!base) return base;

  let { cs = null, ar = null, od = null, hp = null, bpm = 0 } = base;
  let rate = 1;

  if (mods.has("EZ")) {
    if (cs != null) cs = cs * 0.5;
    if (ar != null) ar = ar * 0.5;
    if (od != null) od = od * 0.5;
    if (hp != null) hp = hp * 0.5;
  }
  if (mods.has("HR")) {
    if (cs != null) cs = cap(cs * 1.3);
    if (ar != null) ar = cap(ar * 1.4);
    if (od != null) od = cap(od * 1.4);
    if (hp != null) hp = cap(hp * 1.4);
  }
  if (mods.has("DT") || mods.has("NC")) rate = 1.5;
  if (mods.has("HT")) rate = 0.75;

  // Speed mods shift the *effective* AR & OD via timing windows.
  if (rate !== 1 && ar != null) {
    // Convert AR -> ms, adjust by rate, convert back. (approx)
    const ms = ar <= 5 ? 1800 - 120 * ar : 1200 - 150 * (ar - 5);
    const newMs = ms / rate;
    ar = newMs > 1200 ? (1800 - newMs) / 120 : (1200 - newMs) / 150 + 5;
    ar = cap(ar, 11);
  }
  if (rate !== 1 && od != null) {
    // Hit300 window in ms.
    const ms = 79.5 - 6 * od;
    const newMs = ms / rate;
    od = (79.5 - newMs) / 6;
    od = cap(od, 11);
  }

  return {
    cs,
    ar,
    od,
    hp,
    bpm: bpm * rate,
    length_rate: rate,
  };
}

// Compute total score multiplier.
export function totalMultiplier(modSet) {
  const mods = modSet instanceof Set ? modSet : new Set(modSet || []);
  let m = 1;
  mods.forEach((k) => {
    const def = MOD_DEFS[k];
    if (def) m *= def.multiplier;
  });
  return m;
}
