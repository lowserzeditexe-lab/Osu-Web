// AuthCallback — mounts when the browser lands at
// `<origin>/auth/callback#session_id=…` (Emergent OAuth redirect target).
//
// Exchanges the session_id for an httpOnly cookie by POSTing to our
// backend, then navigates to /solo (the "logged-in" landing page).
//
// Uses a useRef flag (not useState) so StrictMode's double-invocation
// doesn't fire two exchange requests.
import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import apiClient from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [error, setError] = useState(null);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const raw = (location.hash || window.location.hash || "").replace(/^#/, "");
    const params = new URLSearchParams(raw);
    const sid = params.get("session_id");
    if (!sid) {
      setError("Aucun session_id dans l'URL — connexion annulée.");
      return;
    }
    (async () => {
      try {
        await apiClient.post("/auth/session", { session_id: sid });
        // Clear the fragment so a manual refresh doesn't retry the exchange.
        try { window.history.replaceState({}, "", "/auth/callback"); }
        catch (_) { /* history API unavailable — hash cleanup is best-effort */ }
        const u = await refresh();
        navigate("/solo", { replace: true, state: { user: u } });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[auth callback] exchange failed", e);
        setError(
          e?.response?.data?.error ||
          e?.message ||
          "Échec de la connexion — réessayez."
        );
      }
    })();
  }, [location.hash, navigate, refresh]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-black text-white">
      <div className="max-w-md w-full mx-6 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-8 text-center">
        <div className="text-[11px] uppercase tracking-[0.3em] text-white/40 mb-3">
          Emergent OAuth
        </div>
        {error ? (
          <>
            <h1 className="text-xl font-semibold mb-3">Connexion échouée</h1>
            <p className="text-sm text-red-300/80 mb-6">{error}</p>
            <button
              type="button"
              onClick={() => navigate("/", { replace: true })}
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.06] hover:bg-white/[0.1] px-5 py-2 text-[12px] uppercase tracking-[0.2em]"
            >
              Retour au menu
            </button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold mb-2">Connexion en cours…</h1>
            <p className="text-sm text-white/60">
              On échange ta session avec le serveur, ça prend une seconde.
            </p>
            <div className="mt-6 h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
              <div className="h-full w-1/3 bg-white/70 animate-pulse rounded-full" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
