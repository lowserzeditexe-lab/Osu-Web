import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from "react";

const AudioPlayerContext = createContext(null);

export function AudioPlayerProvider({ children }) {
  const [currentBeatmap, setCurrentBeatmap] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audio.volume = 0.3;
    // Like osu! song-select: keep the preview looping forever as long as the
    // beatmap stays selected. The OSU API preview clip is ~10 s starting at
    // the beatmap's preview point, so HTMLAudioElement.loop=true seamlessly
    // restarts it — matching the real game's "selected song music" behaviour.
    audio.loop = true;
    audioRef.current = audio;

    // Bulletproof loop: even though `audio.loop = true` should be enough,
    // some browsers (notably Brave with shields, Safari, certain mobile
    // versions) still fire `ended` near the end of cross-origin audio.
    // We re-arm the source and replay manually so the preview never stops.
    // Re-asserting loop=true and calling load() before play() handles cases
    // where Brave drops the loop flag after a stream completes.
    const onEnded = () => {
      try {
        audio.loop = true;
        audio.currentTime = 0;
        // Some browsers leave the element in an "ended" readyState; nudging
        // it via load() forces a clean re-arm before play().
        if (audio.ended) {
          const src = audio.src;
          if (src) {
            audio.src = src;
            audio.load();
          }
        }
        const p = audio.play();
        if (p && typeof p.catch === "function") {
          p.catch(() => { setIsPlaying(false); setLoading(false); });
        }
      } catch (_) {
        setIsPlaying(false);
        setProgress(0);
      }
    };
    const onTimeUpdate = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setProgress(audio.currentTime / audio.duration);
      }
    };
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onError = () => { setIsPlaying(false); setLoading(false); };
    const onCanPlay = () => setLoading(false);
    const onWaiting = () => setLoading(true);
    const onPlaying = () => { setLoading(false); setIsPlaying(true); };

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("error", onError);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);

    return () => {
      audio.pause();
      audio.src = "";
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
    };
  }, []);

  const play = useCallback((beatmap) => {
    if (!beatmap?.audio_url) return;
    const audio = audioRef.current;
    if (!audio) return;
    // Re-assert loop=true here in addition to the once-at-mount setup. Some
    // browsers (notably Brave with shields, mobile Safari) reset this flag
    // when the `src` is changed via `audio.src = ...` + `audio.load()`,
    // which would cause the preview to play exactly once and stop. Setting
    // it AFTER load() guarantees the property survives source changes.
    if (currentBeatmap?.id !== beatmap.id) {
      audio.pause();
      audio.src = beatmap.audio_url;
      audio.load();
      setCurrentBeatmap(beatmap);
      setProgress(0);
      setLoading(true);
    }
    audio.loop = true;
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
      audio.loop = true;
      audio.play().catch(() => { setIsPlaying(false); setLoading(false); });
    }
  }, [currentBeatmap, isPlaying]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // Just pause + reset — we DON'T clear `audio.src` here. Setting src=""
    // would resolve to the document URL (browser quirk) and put the element
    // into an error/loading state, which makes the next `play()` flaky.
    // The src will be overwritten by the next `play(beatmap)` call anyway.
    audio.pause();
    try { audio.currentTime = 0; } catch (_) { /* may throw if no source */ }
    setCurrentBeatmap(null);
    setIsPlaying(false);
    setProgress(0);
    setDuration(0);
  }, []);

  const seek = useCallback((ratio) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio);
  }, []);

  return (
    <AudioPlayerContext.Provider value={{
      currentBeatmap, isPlaying, progress, duration, loading,
      play, pause, toggle, stop, seek
    }}>
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) throw new Error("useAudioPlayer must be used within AudioPlayerProvider");
  return ctx;
}
