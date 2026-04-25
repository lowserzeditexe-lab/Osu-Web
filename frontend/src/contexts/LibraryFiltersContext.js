import React, { createContext, useContext, useState } from "react";

export const EMPTY_FILTERS = {
  genre: "",
  language: "",
  bpm_min: "",
  bpm_max: "",
  diff_min: "",
  diff_max: "",
};

const LibraryFiltersContext = createContext(null);

export function LibraryFiltersProvider({ children }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  return (
    <LibraryFiltersContext.Provider value={{ filters, setFilters }}>
      {children}
    </LibraryFiltersContext.Provider>
  );
}

export function useLibraryFilters() {
  const ctx = useContext(LibraryFiltersContext);
  if (!ctx) return { filters: EMPTY_FILTERS, setFilters: () => {} };
  return ctx;
}
