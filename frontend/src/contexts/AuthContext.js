// AuthContext — thin wrapper around Emergent-managed Google OAuth.
//
// `user` is:
//   • undefined while /api/auth/me is loading
//   • null when the visitor is anonymous
//   • { user_id, email, username, name, picture, country } when signed in
//
// Sign-in is initiated by AuthContext.signIn() which redirects to the
// Emergent auth service; after Google finishes, the browser lands at
// `<origin>/auth/callback#session_id=…` — see AuthCallback.js which POSTs
// the session_id to our backend to exchange it for an httpOnly cookie.
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import apiClient from "@/lib/apiClient";

const AuthContext = createContext(null);

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
function buildAuthUrl() {
  const redirect = window.location.origin + "/auth/callback";
  return `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);

  const refresh = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/auth/me");
      setUser(data);
      return data;
    } catch (e) {
      if (e?.response?.status === 401) {
        setUser(null);
        return null;
      }
      // Network / transient — treat as anonymous but log for debugging.
      // eslint-disable-next-line no-console
      console.warn("[auth] /me failed:", e?.message);
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    // CRITICAL: If the URL currently carries a session_id in its hash,
    // it means we're mid-callback. AuthCallback will exchange the
    // session_id first and call `refresh()` when it's done — running
    // `refresh()` here would just hit /me before the cookie is set.
    if (window.location.hash?.includes("session_id=")) {
      setUser(null); // loading state is fine; AuthCallback will update
      return;
    }
    refresh();
  }, [refresh]);

  const signIn = useCallback(() => {
    window.location.href = buildAuthUrl();
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiClient.post("/auth/logout");
    } catch (_) { /* server may be unreachable — clear locally anyway */ }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, refresh, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
