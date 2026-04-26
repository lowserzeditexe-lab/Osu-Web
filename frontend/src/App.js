import React, { useEffect, useState } from "react";
import "@/App.css";
import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
  useNavigate,
} from "react-router-dom";
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
import AppBootOverlay from "@/components/AppBootOverlay";
import { useLenis } from "@/hooks/useLenis";
import { AudioPlayerProvider, useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { SavedBeatmapsProvider } from "@/contexts/SavedBeatmapsContext";
import { LibraryFiltersProvider } from "@/contexts/LibraryFiltersContext";
import { PreloadProvider, usePreload } from "@/contexts/PreloadContext";
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

/**
 * On any real page reload (Ctrl+Shift+R, browser refresh button, or fresh
 * tab open), the user should land in the main menu — never deep-linked
 * into Solo/Library/etc. We detect a fresh document load via the
 * Navigation Timing API and reroute to "/" once. Internal link clicks are
 * not affected because the component only fires on first mount.
 */
function useBootRedirect() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname === "/") return;
    let isReload = true;
    try {
      const nav = performance.getEntriesByType("navigation")[0];
      // "navigate" = fresh tab/typed URL; "reload" = refresh; both should
      // bounce to "/" per user requirement. "back_forward" preserves history
      // so we leave that alone.
      if (nav && nav.type === "back_forward") isReload = false;
    } catch (_) { /* old browsers — assume reload */ }
    if (isReload) navigate("/", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function Shell() {
  const { currentBeatmap } = useAudioPlayer();
  const { pathname } = useLocation();
  const { phase, total, done, blocking } = usePreload();

  const isSolo = pathname === "/solo";
  const isPlay = pathname.startsWith("/play/");
  useLenis(!isSolo && !isPlay);
  useOsuCursor();
  useBootRedirect();

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

      {/* Boot-time install overlay — only shown during the foreground
          preload passes. Background "verifying" retries are silent. */}
      {blocking && (
        <AppBootOverlay phase={phase} total={total} done={done} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AudioPlayerProvider>
        <SavedBeatmapsProvider>
          <LibraryFiltersProvider>
            <PreloadProvider>
              <Shell />
            </PreloadProvider>
          </LibraryFiltersProvider>
        </SavedBeatmapsProvider>
      </AudioPlayerProvider>
    </BrowserRouter>
  );
}
