import axios from "axios";
import { getClientId } from "./clientId";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Singleton authenticated axios. Every backend call gets the anonymous
// client UUID so the backend can scope per-user data (profile, imports).
// `withCredentials: true` so the httpOnly `session_token` cookie set by
// /api/auth/session is sent on every subsequent request — the backend
// then prefers the authenticated user_id over the anonymous X-Client-Id.
export const apiClient = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  timeout: 0,
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  config.headers["X-Client-Id"] = getClientId();
  return config;
});

export default apiClient;
