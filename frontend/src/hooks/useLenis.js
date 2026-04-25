import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Global smooth-scroll using Lenis. Mounts once at the app root.
 * Mirrors the subtle, slow-easing feel of lenis.dev.
 *
 * Pass `enabled=false` to skip Lenis entirely (e.g. on pages with their
 * own nested scrollable panels that shouldn't be hijacked by smooth scroll).
 */
export function useLenis(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.2,
    });

    let rafId;
    function raf(time) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, [enabled]);
}
