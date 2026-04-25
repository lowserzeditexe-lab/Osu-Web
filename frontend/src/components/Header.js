import React from "react";
import { Link, useLocation } from "react-router-dom";
import SearchBar from "@/components/library/SearchBar";

export default function Header() {
  const { pathname } = useLocation();
  // Search bar visible on library pages EXCEPT beatmap detail
  const isLibrary = pathname.startsWith("/library") && !pathname.startsWith("/library/b/");

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
        isLibrary
          ? "bg-black/50 backdrop-blur-xl border-b border-white/[0.06]"
          : ""
      }`}
    >
      {/* Main nav row */}
      <div className="px-6 md:px-10 py-4 flex items-center justify-between pointer-events-none">
        <Link
          to="/"
          data-testid="header-logo"
          className="pointer-events-auto group flex items-end gap-2 select-none rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-md px-4 py-2"
        >
          <span className="text-[18px] md:text-[20px] font-semibold tracking-tight text-white leading-none">
            osu<span className="text-[#ff66aa]">!</span>
          </span>
          <span className="text-[10px] md:text-[11px] uppercase tracking-[0.28em] text-white/50 pb-[2px] group-hover:text-white/80 transition-colors">
            web
          </span>
        </Link>

        <div className="pointer-events-auto flex items-center gap-2 md:gap-3">
          <span className="hidden md:inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-white/55 border border-white/10 bg-white/[0.04] backdrop-blur-md rounded-full px-3 py-1.5">
            <span className="h-[6px] w-[6px] rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_#34d399]" />
            online
          </span>
          <span
            data-testid="header-version"
            className="text-[10px] uppercase tracking-[0.28em] text-white/55 border border-white/10 bg-white/[0.04] backdrop-blur-md rounded-full px-3 py-1.5"
          >
            v0.1.0
          </span>
          {/* menu button removed */}
        </div>
      </div>

      {/* Library search row — only on /library* routes */}
      {isLibrary && (
        <div className="px-6 md:px-10 pb-4">
          <SearchBar />
        </div>
      )}
    </header>
  );
}
