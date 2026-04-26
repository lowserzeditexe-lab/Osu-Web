// Anonymous client identity.
//
// Until we add real auth, every browser is given a UUID v4 on first
// visit. That UUID is sent in the `X-Client-Id` header on every backend
// request and is the owner-key for the user's profile, imports and (later)
// scores.
const KEY = "osuweb:clientId";

function uuidv4() {
  // RFC 4122 v4 — use crypto when available, fall back to Math.random for
  // very old browsers / SSR.
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const h = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
    return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h.slice(8, 10).join("")}-${h.slice(10, 16).join("")}`;
  }
  // Last-resort fallback (low entropy, not RFC-strict).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let _cached = null;

export function getClientId() {
  if (_cached) return _cached;
  try {
    const stored = localStorage.getItem(KEY);
    if (stored && stored.length >= 8) {
      _cached = stored;
      return stored;
    }
  } catch (_) { /* private mode */ }
  const fresh = uuidv4();
  try { localStorage.setItem(KEY, fresh); } catch (_) {}
  _cached = fresh;
  return fresh;
}
