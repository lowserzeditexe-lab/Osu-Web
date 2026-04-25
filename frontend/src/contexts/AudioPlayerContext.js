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
    audioRef.current = audio;

    const onEnded = () => { setIsPlaying(false); setProgress(0); };
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
    if (currentBeatmap?.id !== beatmap.id) {
      audio.pause();
      audio.src = beatmap.audio_url;
      audio.load();
      setCurrentBeatmap(beatmap);
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
      audio.play().catch(() => { setIsPlaying(false); setLoading(false); });
    }
  }, [currentBeatmap, isPlaying]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.src = "";
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
