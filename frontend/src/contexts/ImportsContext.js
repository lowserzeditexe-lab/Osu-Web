import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { listImports, uploadImport, deleteImport } from "@/lib/userApi";

const ImportsContext = createContext(null);

export function ImportsProvider({ children }) {
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  // The currently-uploading file's progress (0..1), null if no upload in
  // flight. We expose a single in-flight upload at a time — dropping a
  // second .osz while one is uploading queues sequentially.
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadError, setUploadError] = useState(null);

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

  return (
    <ImportsContext.Provider value={{
      imports, loading, uploadProgress, uploadError,
      refresh, upload, uploadMany, remove,
    }}>
      {children}
    </ImportsContext.Provider>
  );
}

export function useImports() {
  const ctx = useContext(ImportsContext);
  if (!ctx) throw new Error("useImports must be used within ImportsProvider");
  return ctx;
}
