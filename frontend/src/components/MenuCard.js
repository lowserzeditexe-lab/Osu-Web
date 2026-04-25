import React, { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Play, Users, Library, Settings, ArrowUpRight } from "lucide-react";

const ICONS = {
  play: Play,
  users: Users,
  library: Library,
  settings: Settings,
};

export default function MenuCard({ item, index }) {
  const navigate = useNavigate();
  const Icon = ICONS[item.icon] || Play;
  const num = String(index + 1).padStart(2, "0");
  const ref = useRef(null);

  // Local cursor position inside the card (in pixels).
  const mx = useMotionValue(-200);
  const my = useMotionValue(-200);
  // Normalised -1..1 for tilt.
  const nx = useMotionValue(0);
  const ny = useMotionValue(0);
  const rotX = useSpring(useTransform(ny, [-1, 1], [6, -6]), {
    stiffness: 120,
    damping: 18,
    mass: 0.4,
  });
  const rotY = useSpring(useTransform(nx, [-1, 1], [-8, 8]), {
    stiffness: 120,
    damping: 18,
    mass: 0.4,
  });
  const transX = useSpring(useTransform(nx, [-1, 1], [-4, 4]), {
    stiffness: 120,
    damping: 20,
  });
  const transY = useSpring(useTransform(ny, [-1, 1], [-4, 4]), {
    stiffness: 120,
    damping: 20,
  });

  function handleMouseMove(e) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mx.set(x);
    my.set(y);
    nx.set((x / rect.width - 0.5) * 2);
    ny.set((y / rect.height - 0.5) * 2);
  }

  function handleMouseLeave() {
    mx.set(-200);
    my.set(-200);
    nx.set(0);
    ny.set(0);
  }

  // Spotlight background follows cursor.
  const spotlight = useTransform([mx, my], ([x, y]) =>
    `radial-gradient(360px circle at ${x}px ${y}px, ${item.accent}33, transparent 55%)`
  );
  // Border highlight follows cursor (angle-less variant using a softer radial).
  const border = useTransform([mx, my], ([x, y]) =>
    `radial-gradient(220px circle at ${x}px ${y}px, ${item.accent}aa, ${item.accent}22 35%, transparent 65%)`
  );

  return (
    <motion.div
      style={{ perspective: 1200 }}
      className="relative h-full"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, delay: 0.15 + index * 0.08, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.button
        type="button"
        ref={ref}
        onClick={() => navigate(`/${item.slug}`)}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        data-testid={`menu-card-${item.slug}`}
        whileHover="hover"
        whileTap={{ scale: 0.985 }}
        style={{
          rotateX: rotX,
          rotateY: rotY,
          x: transX,
          y: transY,
          transformStyle: "preserve-3d",
          '--accent': item.accent,
        }}
        className="group relative w-full h-full text-left overflow-hidden rounded-2xl p-[1px] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 will-change-transform"
      >
        {/* Animated border (under card) */}
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-2xl opacity-80"
          style={{ background: border }}
        />

        {/* Glass card body */}
        <div
          className="relative h-full rounded-[15px] border border-white/10 bg-white/[0.035] backdrop-blur-xl p-7 md:p-9 min-h-[260px] md:min-h-[300px] flex flex-col justify-between overflow-hidden"
          style={{ transform: "translateZ(0)" }}
        >
          {/* Spotlight */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: spotlight }}
          />

          {/* Subtle inner gradient to sell the glass */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              background:
                "linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 40%)",
            }}
          />

          {/* Top-right arrow */}
          <motion.span
            aria-hidden
            variants={{ hover: { x: 4, y: -4, opacity: 1 } }}
            initial={{ x: 0, y: 0, opacity: 0.55 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-5 right-5 md:top-6 md:right-6 text-white/75"
            style={{ transform: "translateZ(30px)" }}
          >
            <ArrowUpRight size={20} strokeWidth={1.5} />
          </motion.span>

          {/* Top row: index + icon */}
          <div className="relative flex items-start justify-between" style={{ transform: "translateZ(20px)" }}>
            <span className="text-[11px] uppercase tracking-[0.3em] text-white/45">
              {num} / {item.slug}
            </span>
            <motion.span
              aria-hidden
              variants={{ hover: { scale: 1.08 } }}
              initial={{ scale: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="hidden md:inline-flex items-center justify-center h-10 w-10 rounded-full border border-white/10 bg-white/[0.03] backdrop-blur text-white/70"
            >
              <Icon size={18} strokeWidth={1.5} />
            </motion.span>
          </div>

          {/* Title & description */}
          <div className="relative mt-10 md:mt-14" style={{ transform: "translateZ(40px)" }}>
            <motion.h2
              variants={{ hover: { x: 2 } }}
              initial={{ x: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="text-[44px] md:text-[64px] leading-[0.95] font-semibold tracking-tight text-white"
            >
              {item.title}
            </motion.h2>
            <p className="mt-3 md:mt-4 text-[13px] md:text-[14px] leading-relaxed text-white/55 max-w-[34ch] line-clamp-2 min-h-[2.8em]">
              {item.description}
            </p>
          </div>

          {/* Bottom accent line */}
          <motion.div
            aria-hidden
            variants={{ hover: { scaleX: 1 } }}
            initial={{ scaleX: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-7 right-7 md:left-9 md:right-9 bottom-6 h-px origin-left"
            style={{ background: `linear-gradient(90deg, ${item.accent}, transparent)` }}
          />
        </div>
      </motion.button>
    </motion.div>
  );
}
