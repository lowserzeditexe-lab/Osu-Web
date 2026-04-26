import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";

const AudioPlayerContext = createContext(null);

/**
 * AudioPlayerProvider — single shared HTMLAudioElement for the whole app.
 *
 * Two playback modes:
 *  • "preview" (default for Library / BeatmapDetail / MiniPlayer):
 *      plays the 10-second OSU API preview clip (b.ppy.sh/preview/{id}.mp3).
 *      Native `audio.loop = true` reboucle indefinitely, with a defensive
 *      onEnded fallback for browsers that drop the loop flag on cross-origin
 *      media (Brave shields, some Safari builds).
 *
 *  • "last30" (Solo song-select):
 *      audio.src is a *blob URL* of the FULL beatmap audio (extracted from
 *      the .osz via `lib/beatmapAudio.js`). On `loadedmetadata` we seek to
 *      `duration - 30` and from there `ended` always brings us back to the
 *      same offset → the listener hears the climax / outro of the actual
 *      song looping, just like osu!'s in-game menu music behaviour.
 */
export function AudioPlayerProvider({ children }) {
  const [currentBeatmap, setCurrentBeatmap] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef(null);
  // Playback mode for the currently loaded src. We keep it in a ref because
  // the audio event handlers below are bound once at mount and need to read
  // the latest value without forcing a remount of every listener.
  const modeRef = useRef("preview"); // "preview" | "last30"
  // For "last30" mode: the timestamp the loop should restart from (in seconds).
  const last30StartRef = useRef(0);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audio.volume = 0.3;
    // For "preview" mode the browser handles looping natively. We override
    // this to false at the start of "last30" mode where we manage the loop
    // ourselves so it stays inside [duration-30, duration].
    audio.loop = true;
    audioRef.current = audio;

    // ── Computes where a "last30" loop should restart from. We re-read the
    // audio.duration each time because metadata may have changed since the
    // ref was set (e.g. after a src swap to a longer track).
    const computeLast30Start = () => {
      const d = audio.duration;
      if (!d || !isFinite(d)) return 0;
      return Math.max(0, d - 30);
    };

    // ── ended: rewind + restart. Two flavours:
    //   - last30: seek to duration-30 (or 0 if duration < 30), then play.
    //   - preview: seek to 0 + replay (defensive — natively `loop=true`
    //     means this event shouldn't fire, but Brave/Safari sometimes do).
    const onEnded = () => {
      try {
        const audioEl = audioRef.current;
        if (!audioEl) return;
        if (modeRef.current === "last30") {
          audioEl.loop = false;
          const start = computeLast30Start();
          last30StartRef.current = start;
          try { audioEl.currentTime = start; } catch (_) { /* before metadata */ }
        } else {
          audioEl.loop = true;
          try { audioEl.currentTime = 0; } catch (_) { /* idem */ }
        }
        // Some browsers leave the element in `ended` readyState; nudging it
        // via load() forces a clean re-arm.
        if (audioEl.ended) {
          const src = audioEl.src;
          if (src) {
            audioEl.src = src;
            audioEl.load();
            // After re-load, restore position immediately on metadata.
            const restore = () => {
              try {
                audioEl.currentTime =
                  modeRef.current === "last30" ? computeLast30Start() : 0;
              } catch (_) { /* noop */ }
              audioEl.removeEventListener("loadedmetadata", restore);
            };
            audioEl.addEventListener("loadedmetadata", restore);
          }
        }
        const p = audioEl.play();
        if (p && typeof p.catch === "function") {
          p.catch(() => { setIsPlaying(false); setLoading(false); });
        }
      } catch (_) {
        setIsPlaying(false);
        setProgress(0);
      }
    };

    // ── timeupdate: drives the progress bar AND enforces the last30 window.
    // If the user (or the browser) ever drops the playhead before the
    // duration-30 mark while in last30 mode, we yank it back in. This means
    // even if the metadata loads late and the element starts at 0, we'll
    // realign as soon as we have a usable duration.
    const onTimeUpdate = () => {
      const a = audioRef.current;
      if (!a || !a.duration || !isFinite(a.duration)) return;
      if (modeRef.current === "last30") {
        const start = computeLast30Start();
        last30StartRef.current = start;
        if (a.currentTime < start - 0.05) {
          try { a.currentTime = start; } catch (_) { /* noop */ }
        }
        // Progress is shown as ratio inside the [start, duration] window so
        // the UI bar fills 0→1 over the 30 s loop, not over the whole track.
        const windowSize = a.duration - start || 1;
        setProgress(Math.max(0, (a.currentTime - start) / windowSize));
      } else {
        setProgress(a.currentTime / a.duration);
      }
    };

    // ── loadedmetadata: in last30 mode we land at duration-30 immediately.
    const onLoadedMetadata = () => {
      const a = audioRef.current;
      if (!a) return;
      if (modeRef.current === "last30") {
        const start = computeLast30Start();
        last30StartRef.current = start;
        try { a.currentTime = start; } catch (_) { /* noop */ }
      }
    };

    const onDurationChange = () => setDuration(audio.duration || 0);
    const onError = () => { setIsPlaying(false); setLoading(false); };
    const onCanPlay = () => setLoading(false);
    const onWaiting = () => setLoading(true);
    const onPlaying = () => { setLoading(false); setIsPlaying(true); };
    const onPause = () => { setIsPlaying(false); };

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("error", onError);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.pause();
      audio.src = "";
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
    };
  }, []);

  // ── Preview mode (existing API, unchanged) ─────────────────────────────────
  const play = useCallback((beatmap) => {
    if (!beatmap?.audio_url) return;
    const audio = audioRef.current;
    if (!audio) return;
    if (currentBeatmap?.id !== beatmap.id) {
      audio.pause();
      audio.src = beatmap.audio_url;
      audio.load();
      setCurrentBeatmap(beatmap);
      setProgress(0);
      setLoading(true);
    }
    modeRef.current = "preview";
    audio.loop = true;
    audio.play().catch(() => { setIsPlaying(false); setLoading(false); });
  }, [currentBeatmap]);

  // ── last30 mode: full beatmap audio, looped over its last 30 s ────────────
  /**
   * Play a *full track* audio (typically a blob URL produced by
   * `lib/beatmapAudio.js`) and loop it on its last 30 seconds. Use this for
   * the Solo page background music.
   *
   * @param {string} audioUrl  blob URL (or any seekable mp3/ogg) for the
   *                           full beatmap audio file.
   * @param {object} [beatmap] beatmap metadata to expose in `currentBeatmap`.
   */
  const playLast30 = useCallback((audioUrl, beatmap) => {
    if (!audioUrl) return;
    const audio = audioRef.current;
    if (!audio) return;
    // Always switch into last30 mode FIRST so onLoadedMetadata can act.
    modeRef.current = "last30";
    last30StartRef.current = 0;
    // Native loop is OFF — onEnded handles the wrap so we stay inside the
    // 30-second window instead of restarting from 0.
    audio.loop = false;

    const sameBeatmap =
      beatmap && currentBeatmap && currentBeatmap.id === beatmap.id;
    if (!sameBeatmap || audio.src !== audioUrl) {
      audio.pause();
      audio.src = audioUrl;
      audio.load();
      if (beatmap) setCurrentBeatmap(beatmap);
      setProgress(0);
      setLoading(true);
    }
    audio.play().catch(() => { setIsPlaying(false); setLoading(false); });
  }, [currentBeatmap]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setIsPlaying(false);
  }, []);

  const toggle = useCallback((beatmap) => {
    if (!beatmap?.audio_url) return;
    const audio = audioRef.current;
    if (!audio) return;
    if (currentBeatmap?.id === beatmap.id) {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        audio.play().catch(() => { setIsPlaying(false); });
      }
    } else {
      audio.pause();
      audio.src = beatmap.audio_url;
      audio.load();
      setCurrentBeatmap(beatmap);
      setProgress(0);
      setIsPlaying(false);
      setLoading(true);
      modeRef.current = "preview";
      audio.loop = true;
      audio.play().catch(() => { setIsPlaying(false); setLoading(false); });
    }
  }, [currentBeatmap, isPlaying]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    try { audio.currentTime = 0; } catch (_) { /* may throw if no source */ }
    modeRef.current = "preview";
    setCurrentBeatmap(null);
    setIsPlaying(false);
    setProgress(0);
    setDuration(0);
  }, []);

  const seek = useCallback((ratio) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    if (modeRef.current === "last30") {
      const start = last30StartRef.current || Math.max(0, audio.duration - 30);
      const windowSize = audio.duration - start;
      audio.currentTime = start + ratio * windowSize;
      setProgress(ratio);
    } else {
      audio.currentTime = ratio * audio.duration;
      setProgress(ratio);
    }
  }, []);

  return (
    <AudioPlayerContext.Provider
      value={{
        currentBeatmap,
        isPlaying,
        progress,
        duration,
        loading,
        play,
        playLast30,
        pause,
        toggle,
        stop,
        seek,
      }}
    >
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) throw new Error("useAudioPlayer must be used within AudioPlayerProvider");
  return ctx;
}
