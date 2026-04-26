import axios from "axios";
import { getClientId } from "./clientId";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Singleton authenticated axios. Every backend call gets the anonymous
// client UUID so the backend can scope per-user data (profile, imports).
export const apiClient = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  timeout: 0,
});

apiClient.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  config.headers["X-Client-Id"] = getClientId();
  return config;
});

export default apiClient;
