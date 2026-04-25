import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

// ---------- Menu ----------
export async function fetchMenu() {
  const { data } = await api.get("/menu");
  return data.items || [];
}

export async function fetchHealth() {
  const { data } = await api.get("/health");
  return data;
}

// ---------- Beatmaps ----------
export async function fetchBeatmapsCategory(
  category,
  { limit = 6, offset = 0, seed, genre, language, bpm_min, bpm_max, diff_min, diff_max } = {}
) {
  const params = { limit, offset };
  if (seed && category === "random") params.seed = seed;
  if (genre) params.genre = genre;
  if (language) params.language = language;
  if (bpm_min !== undefined && bpm_min !== "") params.bpm_min = bpm_min;
  if (bpm_max !== undefined && bpm_max !== "") params.bpm_max = bpm_max;
  if (diff_min !== undefined && diff_min !== "") params.diff_min = diff_min;
  if (diff_max !== undefined && diff_max !== "") params.diff_max = diff_max;
  const { data } = await api.get(`/beatmaps/${category}`, { params });
  return data; // { items, total, limit, offset, seed? }
}

export async function searchBeatmaps({
  q = "",
  status,
  sort,
  mode,
  genre,
  language,
  bpm_min,
  bpm_max,
  diff_min,
  diff_max,
  limit = 24,
  offset = 0,
} = {}) {
  const params = { limit, offset };
  if (q) params.q = q;
  if (status) params.status = status;
  if (sort) params.sort = sort;
  if (mode) params.mode = mode;
  if (genre) params.genre = genre;
  if (language) params.language = language;
  if (bpm_min !== undefined && bpm_min !== "") params.bpm_min = bpm_min;
  if (bpm_max !== undefined && bpm_max !== "") params.bpm_max = bpm_max;
  if (diff_min !== undefined && diff_min !== "") params.diff_min = diff_min;
  if (diff_max !== undefined && diff_max !== "") params.diff_max = diff_max;
  const { data } = await api.get(`/beatmaps/search`, { params });
  return data;
}

export async function fetchBeatmap(id) {
  const { data } = await api.get(`/beatmaps/${id}`);
  return data;
}

export async function fetchBeatmapScores(diffId, { mode = "osu", type = "global", limit = 50 } = {}) {
  if (!diffId) return { items: [] };
  const { data } = await api.get(`/beatmaps/diff/${diffId}/scores`, {
    params: { mode, type, limit },
  });
  return data; // { items, total, restricted?, beatmap_id, ... }
}
