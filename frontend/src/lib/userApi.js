import apiClient from "./apiClient";

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
  return data.items || [];
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
  return data;
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
