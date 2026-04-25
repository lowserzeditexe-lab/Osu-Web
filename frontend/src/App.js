import React, { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Header from "@/components/Header";
import MenuPage from "@/pages/MenuPage";
import PlaceholderPage from "@/pages/PlaceholderPage";
import LibraryPage from "@/pages/LibraryPage";
import LibraryCategoryPage from "@/pages/LibraryCategoryPage";
import LibrarySearchPage from "@/pages/LibrarySearchPage";
import BeatmapDetailPage from "@/pages/BeatmapDetailPage";
import SoloPage from "@/pages/SoloPage";
import PlayPage from "@/pages/PlayPage";
import MiniPlayer from "@/components/MiniPlayer";
import { useLenis } from "@/hooks/useLenis";
import { AudioPlayerProvider, useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { SavedBeatmapsProvider } from "@/contexts/SavedBeatmapsContext";
import { LibraryFiltersProvider } from "@/contexts/LibraryFiltersContext";
import osuCursorPng from "@/assets/cursor.png";
import osuCursorCur from "@/assets/cursor.cur";

// Inject the osu! cursor into the global --osu-cursor CSS variable as soon
// as the app boots, so the user sees the in-game cursor everywhere on the
// site instead of the OS default cursor.
function useOsuCursor() {
  useEffect(() => {
    const value = `url("${osuCursorPng}") 24 24, url("${osuCursorCur}") 24 24, default`;
    document.documentElement.style.setProperty("--osu-cursor", value);
  }, []);
}

function Shell() {
  const { currentBeatmap } = useAudioPlayer();
  const { pathname } = useLocation();

  const isSolo = pathname === "/solo";
  const isPlay = pathname.startsWith("/play/");
  useLenis(!isSolo && !isPlay);
  useOsuCursor();

  return (
    <div
      className="min-h-screen bg-black text-white selection:bg-white/20"
      style={{ paddingBottom: currentBeatmap && !isSolo && !isPlay ? "72px" : 0 }}
    >
      {!isSolo && !isPlay && <Header />}
      <Routes>
        <Route path="/" element={<MenuPage />} />
        <Route path="/solo" element={<SoloPage />} />
        <Route path="/play/:sid" element={<PlayPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/library/search" element={<LibrarySearchPage />} />
        <Route path="/library/c/:category" element={<LibraryCategoryPage />} />
        <Route path="/library/b/:id" element={<BeatmapDetailPage />} />
        <Route path="/:slug" element={<PlaceholderPage />} />
      </Routes>
      {!isSolo && !isPlay && <MiniPlayer />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AudioPlayerProvider>
        <SavedBeatmapsProvider>
          <LibraryFiltersProvider>
            <Shell />
          </LibraryFiltersProvider>
        </SavedBeatmapsProvider>
      </AudioPlayerProvider>
    </BrowserRouter>
  );
}
