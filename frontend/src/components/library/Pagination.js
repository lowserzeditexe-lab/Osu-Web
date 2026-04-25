import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Controlled pagination. Emits onChange(nextPage) where page is 1-indexed.
 * Renders window of pages centered around current page.
 *
 * If `hasMore` is true, the component treats `total` as a lower bound: the
 * "next" arrow stays enabled and a virtual page after the last known page is
 * shown so the user can keep walking until the backend signals no more results.
 */
export default function Pagination({ page, pageSize, total, hasMore = false, onChange, windowSize = 5 }) {
  const knownPages = Math.max(1, Math.ceil(total / pageSize));
  const totalPages = hasMore ? knownPages + 1 : knownPages;
  if (totalPages <= 1 && !hasMore) return null;

  const half = Math.floor(windowSize / 2);
  let start = Math.max(1, page - half);
  let end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages = [];
  for (let i = start; i <= end; i++) pages.push(i);

  function goto(p) {
    const next = Math.min(totalPages, Math.max(1, p));
    if (next !== page) onChange(next);
  }

  return (
    <nav
      className="flex items-center justify-center gap-2 mt-10"
      data-testid="library-pagination"
      aria-label="Pagination"
    >
      <button
        type="button"
        onClick={() => goto(page - 1)}
        disabled={page <= 1}
        data-testid="library-pagination-prev"
        className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-white/10 bg-white/[0.04] text-white/75 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft size={16} />
      </button>

      {start > 1 && (
        <>
          <PageBtn p={1} active={page === 1} onClick={() => goto(1)} />
          {start > 2 && <span className="text-white/35 px-1">…</span>}
        </>
      )}

      {pages.map((p) => (
        <PageBtn key={p} p={p} active={p === page} onClick={() => goto(p)} />
      ))}

      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="text-white/35 px-1">…</span>}
          <PageBtn p={totalPages} active={page === totalPages} onClick={() => goto(totalPages)} />
        </>
      )}

      <button
        type="button"
        onClick={() => goto(page + 1)}
        disabled={page >= totalPages}
        data-testid="library-pagination-next"
        className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-white/10 bg-white/[0.04] text-white/75 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}

function PageBtn({ p, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`library-pagination-page-${p}`}
      aria-current={active ? "page" : undefined}
      className={`min-w-[36px] h-9 rounded-full px-3 text-[12px] font-medium border transition-colors ${
        active
          ? "bg-white text-black border-white"
          : "border-white/10 bg-white/[0.04] text-white/75 hover:text-white hover:border-white/30"
      }`}
    >
      {p}
    </button>
  );
}
