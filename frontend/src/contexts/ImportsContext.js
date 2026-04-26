import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { listImports, uploadImport, deleteImport, importFromOsu } from "@/lib/userApi";

const ImportsContext = createContext(null);

export function ImportsProvider({ children }) {
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  // The currently-uploading file's progress (0..1), null if no upload in
  // flight. We expose a single in-flight upload at a time — dropping a
  // second .osz while one is uploading queues sequentially.
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  // For Library "Télécharger" — { setId, status: 'fetching'|'done'|'error',
  // error?: string }. Lets the BeatmapDetailPage button show a spinner /
  // success / error without owning its own state.
  const [osuImportState, setOsuImportState] = useState({});

  const refresh = useCallback(async () => {
    try {
      const items = await listImports();
      setImports(items);
    } catch (e) {
      console.error("[imports] list failed", e);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    listImports()
      .then((items) => { if (!cancelled) setImports(items); })
      .catch((e) => console.error("[imports] initial load failed", e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Upload a single file. Returns the new import doc on success.
  // We deliberately await sequentially so dropping 5 .osz at once doesn't
  // saturate the network or open 5 GridFS write streams in parallel.
  const upload = useCallback(async (file) => {
    setUploadError(null);
    setUploadProgress(0);
    try {
      const doc = await uploadImport(file, (p) => setUploadProgress(p));
      setImports((prev) => [doc, ...prev]);
      return doc;
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "upload failed";
      setUploadError(msg);
      throw err;
    } finally {
      setUploadProgress(null);
    }
  }, []);

  const uploadMany = useCallback(async (files) => {
    const results = [];
    for (const f of files) {
      try {
        results.push(await upload(f));
      } catch (_) { /* error already surfaced via uploadError state */ }
    }
    return results;
  }, [upload]);

  const remove = useCallback(async (id) => {
    await deleteImport(id);
    setImports((prev) => prev.filter((it) => it.id !== id));
  }, []);

  // Library → Solo: server-side import from osu! mirror. The backend
  // does the heavy fetch, so the user only waits for one round-trip.
  const importOsuSet = useCallback(async (setId) => {
    const key = String(setId);
    setOsuImportState((s) => ({ ...s, [key]: { status: "fetching" } }));
    try {
      const doc = await importFromOsu(key);
      setImports((prev) => {
        // De-dupe in case the user clicked twice or another tab raced us.
        if (prev.some((it) => it.id === doc.id)) return prev;
        return [doc, ...prev];
      });
      setOsuImportState((s) => ({ ...s, [key]: { status: "done", doc } }));
      return doc;
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "download failed";
      setOsuImportState((s) => ({ ...s, [key]: { status: "error", error: msg } }));
      throw err;
    }
  }, []);

  // Lookup: is a given osu! beatmapset already in this user's collection?
  const isOsuSetImported = useCallback(
    (setId) => {
      if (setId == null) return false;
      const target = parseInt(setId, 10);
      if (!Number.isFinite(target)) return false;
      return imports.some((bm) => bm.osu_set_id === target);
    },
    [imports]
  );

  // The actual import doc for an osu! set, if present.
  const findOsuSet = useCallback(
    (setId) => {
      if (setId == null) return null;
      const target = parseInt(setId, 10);
      if (!Number.isFinite(target)) return null;
      return imports.find((bm) => bm.osu_set_id === target) || null;
    },
    [imports]
  );

  const value = useMemo(
    () => ({
      imports,
      loading,
      uploadProgress,
      uploadError,
      osuImportState,
      refresh,
      upload,
      uploadMany,
      remove,
      importOsuSet,
      isOsuSetImported,
      findOsuSet,
    }),
    [imports, loading, uploadProgress, uploadError, osuImportState, refresh, upload, uploadMany, remove, importOsuSet, isOsuSetImported, findOsuSet]
  );

  return <ImportsContext.Provider value={value}>{children}</ImportsContext.Provider>;
}

export function useImports() {
  const ctx = useContext(ImportsContext);
  if (!ctx) throw new Error("useImports must be used within ImportsProvider");
  return ctx;
}
