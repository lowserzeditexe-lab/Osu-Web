import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Loader2 } from "lucide-react";

/**
 * Full-page overlay shown while the user is dragging a file over the Solo
 * page, OR while an upload is in progress. Two visual modes:
 *
 *   - mode = "drop"     : large dashed circle, "Drop your .osz here"
 *   - mode = "uploading": progress bar + percent
 */
export default function DropOverlay({
  visible,
  mode = "drop",
  progress = 0,
  uploadingFilename = null,
  errorMessage = null,
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="drop-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center"
          data-testid="solo-drop-overlay"
        >
          {/* Background dim */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

          {/* Dashed accent border */}
          <div
            className="absolute inset-6 rounded-3xl border-[2.5px] border-dashed"
            style={{ borderColor: "#ff66aa", boxShadow: "0 0 60px rgba(255, 102, 170, 0.35) inset" }}
          />

          {/* Center content */}
          <div className="relative flex flex-col items-center gap-5 max-w-md text-center px-6">
            <motion.div
              initial={{ scale: 0.85 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 22 }}
              className="h-24 w-24 rounded-2xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #ff66aa, #d44680)",
                boxShadow: "0 16px 48px rgba(255, 102, 170, 0.55)",
              }}
            >
              {mode === "uploading" ? (
                <Loader2 size={42} strokeWidth={2.4} className="text-white animate-spin" />
              ) : (
                <Upload size={42} strokeWidth={2.4} className="text-white" />
              )}
            </motion.div>

            {mode === "uploading" ? (
              <>
                <p className="text-[20px] font-bold text-white">
                  Upload de la beatmap
                </p>
                {uploadingFilename && (
                  <p className="text-[12px] text-white/55 truncate max-w-[420px]">
                    {uploadingFilename}
                  </p>
                )}
                <div className="w-[320px] max-w-full">
                  <div className="relative h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-150"
                      style={{
                        width: `${Math.round((progress || 0) * 100)}%`,
                        background: "linear-gradient(90deg, #ff66aa, #d44680)",
                      }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] uppercase tracking-[0.22em] text-white/55 font-semibold">
                    {Math.round((progress || 0) * 100)}%
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="text-[22px] font-bold text-white">Glisse ton fichier .osz ici</p>
                <p className="text-[13px] text-white/55 leading-relaxed">
                  Le serveur va parser ta map, extraire l'audio et l'image,
                  puis tu pourras la lancer en Solo.
                </p>
              </>
            )}

            {errorMessage && (
              <p className="mt-2 text-[12px] text-red-400 font-semibold">
                {errorMessage}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
