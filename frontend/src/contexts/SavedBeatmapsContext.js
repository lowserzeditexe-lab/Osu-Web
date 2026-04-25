import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "osuweb_saved_beatmaps";
const SavedBeatmapsContext = createContext(null);

export function SavedBeatmapsProvider({ children }) {
  const [saved, setSaved] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {}
  }, [saved]);

  const isSaved = useCallback((id) => saved.some((b) => String(b.id) === String(id)), [saved]);

  const toggle = useCallback((beatmap) => {
    setSaved((prev) => {
      if (prev.some((b) => String(b.id) === String(beatmap.id))) {
        return prev.filter((b) => String(b.id) !== String(beatmap.id));
      }
      return [beatmap, ...prev];
    });
  }, []);

  const clearAll = useCallback(() => setSaved([]), []);

  return (
    <SavedBeatmapsContext.Provider value={{ saved, isSaved, toggle, clearAll }}>
      {children}
    </SavedBeatmapsContext.Provider>
  );
}

export function useSavedBeatmaps() {
  const ctx = useContext(SavedBeatmapsContext);
  if (!ctx) throw new Error("useSavedBeatmaps must be used within SavedBeatmapsProvider");
  return ctx;
}
