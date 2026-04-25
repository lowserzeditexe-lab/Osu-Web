import React from "react";
import { Link } from "react-router-dom";
import { Play, Pause, X, Music, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { difficultyColor } from "@/lib/format";

export default function MiniPlayer() {
  const { currentBeatmap, isPlaying, progress, loading, toggle, stop, seek } = useAudioPlayer();

  const color = currentBeatmap ? difficultyColor(currentBeatmap.difficulty) : "#fff";

  function handleProgressClick(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    seek(Math.max(0, Math.min(1, ratio)));
  }

  return (
    <AnimatePresence>
      {currentBeatmap && (
        <motion.div
          key="mini-player"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 35 }}
          className="fixed bottom-0 left-0 right-0 z-50"
        >
          {/* Progress bar */}
          <div
            className="h-[3px] w-full bg-white/10 cursor-pointer group hover:h-[5px] transition-all duration-150"
            onClick={handleProgressClick}
          >
            <div
              className="h-full transition-[width] duration-100 rounded-full"
              style={{ width: `${progress * 100}%`, background: color, boxShadow: `0 0 8px ${color}88` }}
            />
          </div>

          {/* Player bar */}
          <div className="flex items-center gap-3 md:gap-4 px-4 md:px-6 py-3 bg-[#0a0a0a]/95 backdrop-blur-2xl border-t border-white/[0.07]">
            {/* Cover art */}
            <Link
              to={`/library/b/${currentBeatmap.id}`}
              className="flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="h-10 w-10 rounded-xl overflow-hidden bg-white/10 border flex-shrink-0"
                style={{ borderColor: `${color}44` }}
              >
                {currentBeatmap.cover_url ? (
                  <img
                    src={currentBeatmap.cover_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music size={16} className="text-white/40" />
                  </div>
                )}
              </div>
            </Link>

            {/* Pulse bar while playing */}
            {isPlaying && (
              <div className="hidden sm:flex items-center gap-[3px] flex-shrink-0">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-[3px] rounded-full"
                    style={{
                      background: color,
                      height: 12,
                      animation: `equalizer-bar 0.8s ease-in-out infinite`,
                      animationDelay: `${i * 0.15}s`,
                    }}
                  />
                ))}
              </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <Link
                to={`/library/b/${currentBeatmap.id}`}
                className="block"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-[13px] font-semibold text-white truncate leading-tight">
                  {currentBeatmap.title}
                </p>
                <p className="text-[11px] text-white/50 truncate">
                  {currentBeatmap.artist}
                </p>
              </Link>
            </div>

            {/* NOW PLAYING badge */}
            <div
              className="hidden md:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] uppercase tracking-[0.25em] flex-shrink-0"
              style={{ background: `${color}22`, color }}
            >
              <span
                className="h-[5px] w-[5px] rounded-full"
                style={{ background: color, boxShadow: `0 0 6px ${color}`, animation: isPlaying ? 'pulse 1.5s infinite' : 'none' }}
              />
              {isPlaying ? "playing" : "paused"}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => toggle(currentBeatmap)}
                disabled={loading}
                className="h-10 w-10 rounded-full flex items-center justify-center text-black hover:scale-105 active:scale-95 transition-transform disabled:opacity-60"
                style={{ background: color }}
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : isPlaying ? (
                  <Pause size={16} fill="black" />
                ) : (
                  <Play size={16} fill="black" />
                )}
              </button>

              <button
                type="button"
                onClick={stop}
                className="h-8 w-8 rounded-full border border-white/15 text-white/50 flex items-center justify-center hover:text-white hover:border-white/35 transition-colors"
                aria-label="Fermer le player"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
