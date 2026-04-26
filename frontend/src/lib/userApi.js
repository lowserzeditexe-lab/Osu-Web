import apiClient from "./apiClient";

// The backend stores cover URLs as path-only (`/api/imports/:id/cover`)
// so they don't bake in the deployment hostname. The browser (and the
// CSS `background-image: url(...)`) needs absolute URLs, so we promote
// them right at the API boundary.
function absolutizeCoverUrls(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const base = process.env.REACT_APP_BACKEND_URL || "";
  for (const k of ["cover_url", "cover_card_url", "cover_full_url"]) {
    const v = doc[k];
    if (typeof v === "string" && v.startsWith("/api/")) {
      doc[k] = `${base}${v}`;
    }
  }
  return doc;
}

export async function fetchMe() {
  const { data } = await apiClient.get("/users/me");
  return data;
}

export async function updateMe(patch) {
  const { data } = await apiClient.patch("/users/me", patch);
  return data;
}

export async function listImports() {
  const { data } = await apiClient.get("/imports");
  return (data.items || []).map(absolutizeCoverUrls);
}

export async function uploadImport(file, onProgress) {
  const fd = new FormData();
  fd.append("osz", file, file.name);
  const { data } = await apiClient.post("/imports", fd, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (!onProgress) return;
      if (e.total) onProgress(e.loaded / e.total);
    },
  });
  return absolutizeCoverUrls(data);
}

export async function deleteImport(id) {
  await apiClient.delete(`/imports/${encodeURIComponent(id)}`);
}

// Build the absolute URL we hand to the engine for downloading a local
// import's .osz blob. Used by play.html via ?local=1 mode.
export function importFileUrl(id) {
  const base = process.env.REACT_APP_BACKEND_URL || "";
  return `${base}/api/imports/${encodeURIComponent(id)}/file`;
}
