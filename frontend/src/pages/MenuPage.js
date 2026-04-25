import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import MenuCard from "@/components/MenuCard";
import AmbientBackground from "@/components/AmbientBackground";
import { fetchMenu } from "@/lib/api";

export default function MenuPage() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  async function load() {
    setStatus("loading");
    setError(null);
    try {
      const data = await fetchMenu();
      setItems(data);
      setStatus("ready");
    } catch (e) {
      setError(e.message || "Unknown error");
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center px-6 md:px-10 pt-28 pb-20">
      <AmbientBackground />

      {/* Title block */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-[1180px] mb-10 md:mb-14"
      >
        <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] backdrop-blur-md px-3 py-1.5">
          <span className="h-[6px] w-[6px] rounded-full bg-[#ff66aa] shadow-[0_0_14px_#ff66aa]" />
          <span className="text-[10px] uppercase tracking-[0.32em] text-white/55">Main Menu</span>
        </div>
        <h1 className="mt-5 text-[44px] md:text-[72px] leading-[0.95] tracking-tight font-semibold text-white">
          Choose your <span className="text-white/35">flow</span>.
        </h1>
        <p className="mt-4 max-w-[54ch] text-[14px] md:text-[15px] text-white/55">
          A minimal, modern front-end for the classic rhythm game. Pick a section below — each one is a distinct experience, built with care.
        </p>
      </motion.div>

      {/* Grid */}
      <div className="relative w-full max-w-[1180px]">
        {status === "loading" && (
          <div className="grid grid-cols-1 md:grid-cols-2 auto-rows-fr gap-4 md:gap-6" data-testid="menu-loading">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md h-[220px] md:h-[260px] animate-pulse"
              />
            ))}
          </div>
        )}

        {status === "error" && (
          <div
            data-testid="menu-error"
            className="rounded-2xl border border-red-400/20 bg-red-500/5 backdrop-blur-md p-8 text-center"
          >
            <p className="text-red-200 text-sm">Couldn&apos;t reach the backend.</p>
            <p className="mt-2 text-white/40 text-xs">{error}</p>
            <button
              type="button"
              onClick={load}
              data-testid="menu-retry"
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.04] px-4 py-2 text-[12px] uppercase tracking-[0.25em] text-white/85 hover:border-white/50 hover:text-white transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {status === "ready" && (
          <div className="grid grid-cols-1 md:grid-cols-2 auto-rows-fr gap-4 md:gap-6" data-testid="menu-grid">
            {items.map((item, index) => (
              <MenuCard key={item.slug} item={item} index={index} />
            ))}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.8 }}
        className="relative mt-14 md:mt-20 flex items-center gap-4 text-[11px] uppercase tracking-[0.3em] text-white/35"
      >
        <span>built with care</span>
        <span className="h-px w-10 bg-white/15" />
        <span>node · express · postgres</span>
      </motion.div>
    </main>
  );
}
