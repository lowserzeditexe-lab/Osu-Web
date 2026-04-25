import React, { useEffect, useRef } from "react";

/**
 * Subtle parallax ambient layer that reacts to the cursor.
 * Renders a few blurred orbs + a faint dot grid. Absolutely positioned to fill parent.
 */
export default function AmbientBackground() {
  const root = useRef(null);
  const orbs = useRef([]);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const raf = useRef(null);

  useEffect(() => {
    const onMove = (e) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      target.current.x = (e.clientX / w - 0.5) * 2; // -1..1
      target.current.y = (e.clientY / h - 0.5) * 2;
    };

    const tick = () => {
      const ease = 0.06;
      current.current.x += (target.current.x - current.current.x) * ease;
      current.current.y += (target.current.y - current.current.y) * ease;
      orbs.current.forEach((el, i) => {
        if (!el) return;
        const depth = [24, 40, 18][i] || 20;
        const tx = current.current.x * depth;
        const ty = current.current.y * depth;
        el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
      });
      raf.current = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    raf.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div
      ref={root}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Pink orb top */}
      <div
        ref={(el) => (orbs.current[0] = el)}
        className="absolute -top-40 left-1/2 -translate-x-1/2 h-[560px] w-[1000px] rounded-full blur-3xl opacity-[0.22]"
        style={{
          background:
            "radial-gradient(closest-side, #ff66aa55, transparent)",
          willChange: "transform",
        }}
      />
      {/* Blue orb bottom-right */}
      <div
        ref={(el) => (orbs.current[1] = el)}
        className="absolute bottom-[-220px] right-[-180px] h-[520px] w-[760px] rounded-full blur-3xl opacity-[0.18]"
        style={{
          background:
            "radial-gradient(closest-side, #66a8ff55, transparent)",
          willChange: "transform",
        }}
      />
      {/* Violet orb left */}
      <div
        ref={(el) => (orbs.current[2] = el)}
        className="absolute top-1/3 left-[-180px] h-[420px] w-[540px] rounded-full blur-3xl opacity-[0.14]"
        style={{
          background:
            "radial-gradient(closest-side, #b388ff55, transparent)",
          willChange: "transform",
        }}
      />

      {/* Fine dot grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage:
            "radial-gradient(circle at center, black 28%, transparent 85%)",
          WebkitMaskImage:
            "radial-gradient(circle at center, black 28%, transparent 85%)",
        }}
      />

      {/* Top/bottom vignettes */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/80 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 to-transparent" />
    </div>
  );
}
