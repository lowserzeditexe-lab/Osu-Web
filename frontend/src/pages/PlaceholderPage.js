import React from "react";
import { motion } from "framer-motion";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AmbientBackground from "@/components/AmbientBackground";

const LABELS = {
  solo: { title: "Solo", accent: "#ff66aa", index: "01" },
  multiplayer: { title: "Multiplayer", accent: "#66a8ff", index: "02" },
  library: { title: "Library", accent: "#b388ff", index: "03" },
  settings: { title: "Settings", accent: "#9aa0a6", index: "04" },
};

export default function PlaceholderPage() {
  const { slug } = useParams();
  const meta = LABELS[slug] || { title: slug, accent: "#ffffff", index: "--" };

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center px-6 md:px-10">
      <AmbientBackground />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="relative text-center rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl px-10 py-14 md:px-16 md:py-20"
        data-testid={`placeholder-${slug}`}
      >
        <span className="text-[11px] uppercase tracking-[0.3em] text-white/45">
          {meta.index} / {slug}
        </span>
        <h1 className="mt-4 text-[64px] md:text-[120px] leading-[0.9] tracking-tight font-semibold text-white">
          {meta.title}
        </h1>
        <p className="mt-5 text-white/55 text-[14px] md:text-[15px] max-w-[44ch] mx-auto">
          This section is on its way. We’ll wire it up step-by-step, keeping the feel consistent across the app.
        </p>

        <div className="mt-10 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-md px-4 py-2 text-[11px] uppercase tracking-[0.3em] text-white/70">
          <span
            className="h-[6px] w-[6px] rounded-full animate-pulse"
            style={{ background: meta.accent, boxShadow: `0 0 12px ${meta.accent}` }}
          />
          Coming soon
        </div>

        <div className="mt-12">
          <Link
            to="/"
            data-testid="placeholder-back"
            className="group inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.3em] text-white/75 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" />
            Back to menu
          </Link>
        </div>
      </motion.div>
    </main>
  );
}
