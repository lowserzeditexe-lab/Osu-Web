import React, { useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

/**
 * /play/:sid — full-screen iframe hosting the Webosu 2 engine.
 *
 * Focus management:
 *   - The iframe must own keyboard focus for in-game keys (Z, X, Esc) to work.
 *   - We auto-focus the iframe on mount.
 *   - We re-focus on click anywhere on the page.
 *   - As a last resort, we forward keyboard events from the parent to the
 *     iframe's window so that even if focus drifts, gameplay keys keep working.
 *
 * Quitting is handled INSIDE the engine via Esc → pause menu → Quit, which
 * posts a "webosu2-quit" message to this window, triggering navigate(-1).
 */
export default function PlayPage() {
  const { sid } = useParams();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const iframeRef = useRef(null);

  const bid = sp.get("bid") || "";
  const v = sp.get("v") || "";
  const title = sp.get("title") || "";
  const artist = sp.get("artist") || "";

  const iframeSrc = sid
    ? `/webosu2/play.html?sid=${encodeURIComponent(sid)}` +
      (bid ? `&bid=${encodeURIComponent(bid)}` : "") +
      (v ? `&v=${encodeURIComponent(v)}` : "") +
      (title ? `&title=${encodeURIComponent(title)}` : "") +
      (artist ? `&artist=${encodeURIComponent(artist)}` : "")
    : null;

  // Listen for quit messages from the iframe.
  useEffect(() => {
    function handleMessage(ev) {
      if (!ev.data) return;
      if (ev.data.type === "webosu2-quit") {
        navigate(-1);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [navigate]);

  // Block body scroll while playing.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Focus the iframe so that keyboard events go to the engine.
  useEffect(() => {
    const focusIframe = () => {
      const f = iframeRef.current;
      if (!f) return;
      try { f.focus({ preventScroll: true }); } catch { f.focus(); }
      try { f.contentWindow && f.contentWindow.focus(); } catch (_) {}
    };
    // Initial focus (after first paint and after a small delay for src to mount).
    const t1 = setTimeout(focusIframe, 50);
    const t2 = setTimeout(focusIframe, 400);
    const t3 = setTimeout(focusIframe, 1500);

    // Re-focus on any click in the parent window.
    const onPointerDown = () => focusIframe();
    window.addEventListener("pointerdown", onPointerDown);

    // Re-focus when the tab regains focus.
    window.addEventListener("focus", focusIframe);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("focus", focusIframe);
    };
  }, [sid]);

  // Forward keyboard events from the parent window to the iframe content,
  // so that even if the iframe loses focus, gameplay keys still reach the
  // engine's listeners (which are attached to the iframe's window).
  useEffect(() => {
    function forward(ev) {
      const f = iframeRef.current;
      if (!f || !f.contentWindow) return;
      // Don't double-fire when focus is already inside the iframe.
      if (document.activeElement === f) return;
      try {
        // Re-create a KeyboardEvent inside the iframe's realm. Using
        // dispatchEvent with cloned init dict is the most reliable way to
        // simulate a real keydown/keyup that downstream listeners see.
        const init = {
          key: ev.key,
          code: ev.code,
          keyCode: ev.keyCode,
          which: ev.which,
          altKey: ev.altKey,
          ctrlKey: ev.ctrlKey,
          metaKey: ev.metaKey,
          shiftKey: ev.shiftKey,
          repeat: ev.repeat,
          bubbles: true,
          cancelable: true,
        };
        const KE = f.contentWindow.KeyboardEvent || KeyboardEvent;
        const cloned = new KE(ev.type, init);
        f.contentWindow.dispatchEvent(cloned);
      } catch (_) { /* ignore cross-origin or detached frame */ }
    }
    window.addEventListener("keydown", forward, true);
    window.addEventListener("keyup", forward, true);
    return () => {
      window.removeEventListener("keydown", forward, true);
      window.removeEventListener("keyup", forward, true);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black" data-testid="play-page">
      {sid ? (
        <iframe
          ref={iframeRef}
          title="WebOsu 2 Play"
          src={iframeSrc}
          className="absolute inset-0 w-full h-full border-0"
          allow="autoplay; fullscreen; gamepad"
          allowFullScreen
          tabIndex={0}
          data-testid="play-iframe"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white/60">
          No beatmap selected.
        </div>
      )}
    </div>
  );
}
