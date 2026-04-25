import React, { useEffect, useState } from "react";

/**
 * Full-screen, heavily blurred backdrop that shows the beatmap cover art
 * behind the page content. Crossfades between covers when `src` changes.
 *
 * Expects the largest cover URL available (e.g. `cover_full_url`).
 */
export default function BeatmapBackdrop({ src, accent = "#b388ff" }) {
  const [current, setCurrent] = useState(src);
  const [previous, setPrevious] = useState(null);

  useEffect(() => {
    if (!src) return;
    if (src === current) return;
    // Preload then swap for a smooth crossfade.
    const img = new Image();
    img.onload = () => {
      setPrevious(current);
      setCurrent(src);
      // remove previous after fade
      setTimeout(() => setPrevious(null), 700);
    };
    img.src = src;
  }, [src, current]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black"
    >
      {/* Previous image (fading out) */}
      {previous && (
        <div
          key={`prev-${previous}`}
          className="absolute inset-0 opacity-0 transition-opacity duration-700"
          style={{
            backgroundImage: `url(${previous})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(90px) saturate(1.15) brightness(0.55)",
            transform: "scale(1.15)",
          }}
        />
      )}

      {/* Current image */}
      {current && (
        <div
          key={`curr-${current}`}
          className="absolute inset-0 opacity-100 transition-opacity duration-700"
          style={{
            backgroundImage: `url(${current})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(90px) saturate(1.15) brightness(0.55)",
            transform: "scale(1.15)",
          }}
        />
      )}

      {/* Accent wash (very subtle) */}
      <div
        className="absolute inset-0 opacity-[0.22] mix-blend-overlay"
        style={{
          background: `radial-gradient(circle at 30% 20%, ${accent}, transparent 60%)`,
        }}
      />

      {/* Vertical dark gradient for readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/85" />

      {/* Bottom + top vignettes */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black to-transparent" />

      {/* Very faint grain / dot grid for texture cohesion with the rest of the app */}
      <div
        className="absolute inset-0 opacity-[0.35] mix-blend-overlay"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage:
            "radial-gradient(circle at center, black 30%, transparent 85%)",
          WebkitMaskImage:
            "radial-gradient(circle at center, black 30%, transparent 85%)",
        }}
      />
    </div>
  );
}
