import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  X,
  ZoomIn,
  ZoomOut,
  Play,
  Pause,
  Minus,
  Plus,
  Settings2,
  Music,
  Type,
  Minimize,
  Maximize,
} from "lucide-react";
import { setlistsApi } from "@/lib/local-api";
import { useAuth } from "@/lib/auth-context";
import { ChordProRenderer } from "@/components/chord-pro-renderer";
import type { Setlist, Song } from "@/types/api";

type FontFamily = "sans" | "mono" | "serif";

interface LiveSettings {
  zoomLevel: number;
  fontFamily: FontFamily;
  showChords: boolean;
  isAutoScroll: boolean;
  scrollSpeed: number;
}

const SCROLL_INTERVAL_MS = 50;
const SCROLL_MIN = 0.1;
const SCROLL_MAX = 8;
const SCROLL_STEP = 0.25;

export default function LiveModePage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { t } = useTranslation();

  const FONT_LABELS: Record<FontFamily, string> = {
    sans: t("liveMode.settings.fonts.sans", "Sans"),
    mono: t("liveMode.settings.fonts.mono", "Mono"),
    serif: t("liveMode.settings.fonts.serif", "Serif"),
  };

  const [setlist, setSetlist] = useState<Setlist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const [settings, setSettings] = useState<LiveSettings>({
    zoomLevel: 1,
    fontFamily: "sans",
    showChords: true,
    isAutoScroll: false,
    scrollSpeed: 1,
  });

  const scrollContainerRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    if (!session || !id) return;
    const [setlistData, setlistSongs] = await Promise.all([
      setlistsApi.get(id, session.user_id),
      setlistsApi.getSongs(id),
    ]);
    setSetlist(setlistData);
    setSongs(setlistSongs);

    const initialSongId = searchParams.get("songId");
    if (initialSongId) {
      const idx = setlistSongs.findIndex((s) => s.id === initialSongId);
      setCurrentIndex(Math.max(0, idx));
    }
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, id]);

  useEffect(() => {
    load();
  }, [load]);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;

    const SWIPE_THRESHOLD = 60;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) handleNext();
      else handlePrev();
    }
  };

  const currentSong = songs[currentIndex];
  const nextSong = songs[currentIndex + 1];
  const progress =
    songs.length > 0 ? ((currentIndex + 1) / songs.length) * 100 : 0;

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev < songs.length - 1) {
        setSettings((s) => ({ ...s, isAutoScroll: false }));
        return prev + 1;
      }
      return prev;
    });
  }, [songs.length]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev > 0) {
        setSettings((s) => ({ ...s, isAutoScroll: false }));
        return prev - 1;
      }
      return prev;
    });
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [currentIndex]);

  useEffect(() => {
    if (!settings.isAutoScroll) return;
    const interval = setInterval(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop += settings.scrollSpeed;
      }
    }, SCROLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [settings.isAutoScroll, settings.scrollSpeed]);

  // Keep the screen awake while on stage.
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await navigator.wakeLock.request("screen");
        }
      } catch (err) {
        console.error("Wake Lock failed:", err);
      }
    };
    requestWakeLock();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") requestWakeLock();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      wakeLock?.release();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
          handleNext();
          break;
        case "ArrowLeft":
        case "PageUp":
          handlePrev();
          break;
        case " ":
          e.preventDefault();
          setSettings((s) => ({ ...s, isAutoScroll: !s.isAutoScroll }));
          break;
        case "+":
        case "=":
          setSettings((s) => ({
            ...s,
            scrollSpeed: Math.min(SCROLL_MAX, s.scrollSpeed + SCROLL_STEP),
          }));
          break;
        case "-":
          setSettings((s) => ({
            ...s,
            scrollSpeed: Math.max(SCROLL_MIN, s.scrollSpeed - SCROLL_STEP),
          }));
          break;
        case "Escape":
          navigate(`/dashboard/setlists/${id}`);
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrev, navigate, id]);

  const update = <K extends keyof LiveSettings>(
    key: K,
    value: LiveSettings[K],
  ) => setSettings((s) => ({ ...s, [key]: value }));

  if (isLoading || !setlist) {
    return (
      <div className="bg-background fixed inset-0 z-50 flex items-center justify-center">
        <span className="text-muted-foreground text-sm">
          {t("common.loading", "Loading...")}
        </span>
      </div>
    );
  }

  if (!currentSong) {
    return (
      <div
        className="bg-background fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 p-4 text-center"
        style={{
          paddingTop: "calc(var(--safe-top) + 1rem)",
          paddingBottom: "calc(var(--safe-bottom) + 1rem)",
        }}
      >
        <h2 className="text-xl font-semibold">{t("liveMode.noSongs")}</h2>
        <button
          onClick={() => navigate(`/dashboard/setlists/${id}`)}
          className="bg-primary text-primary-foreground flex h-11 items-center justify-center rounded-lg px-5 text-sm font-semibold"
        >
          {t("liveMode.back")}
        </button>
      </div>
    );
  }

  const baseFontSize = 1.5 * settings.zoomLevel;

  return (
    <div
      className="bg-background text-foreground fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{
        paddingLeft: "var(--safe-left)",
        paddingRight: "var(--safe-right)",
      }}
    >
      <header
        className="bg-card/50 flex shrink-0 flex-col gap-2 border-b px-3 backdrop-blur-md"
        style={{
          paddingTop: "calc(var(--safe-top) + 0.625rem)",
          paddingBottom: "0.625rem",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => navigate(`/dashboard/setlists/${id}`)}
            aria-label={t("common.close", "Close")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg active:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1 text-center">
            <h1 className="truncate text-lg leading-tight font-bold">
              {currentSong.title}
            </h1>
            <p className="text-muted-foreground truncate text-[10px] tracking-wider uppercase">
              {setlist.title} · {currentIndex + 1}/{songs.length}
            </p>
          </div>

          <button
            onClick={toggleFullscreen}
            aria-label={t(
              "liveMode.settings.toggleFullscreen",
              "Toggle fullscreen",
            )}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg active:bg-muted"
          >
            {isFullscreen ? (
              <Minimize className="h-5 w-5" />
            ) : (
              <Maximize className="h-5 w-5" />
            )}
          </button>
        </div>

        {(currentSong.tempo || currentSong.tonality) && (
          <div className="flex items-center justify-center gap-2">
            {currentSong.tempo && (
              <span className="bg-secondary text-secondary-foreground rounded-md px-2.5 py-1 text-xs font-bold tabular-nums">
                {currentSong.tempo}
                <span className="ml-1 opacity-70">{t("liveMode.bpm")}</span>
              </span>
            )}
            {currentSong.tonality && (
              <span className="bg-primary text-primary-foreground rounded-md px-2.5 py-1 text-xs font-bold">
                {currentSong.tonality}
              </span>
            )}
          </div>
        )}
      </header>

      {/* Lyrics */}
      <main
        ref={scrollContainerRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="flex-1 overflow-auto scroll-smooth p-4 md:p-12"
      >
        <div className="mx-auto max-w-5xl">
          <ChordProRenderer
            content={currentSong.lyrics ?? ""}
            showChords={settings.showChords}
            fontSize={baseFontSize}
            fontFamily={settings.fontFamily}
          />
        </div>
      </main>

      <div
        className={`fixed right-3 z-50 max-w-[calc(100vw-1.5rem)] transition-all duration-300 ${
          showControls ? "translate-x-0" : "translate-x-[calc(100%-40px)]"
        }`}
        style={{ bottom: "calc(var(--safe-bottom) + 6rem)" }}
      >
        <div className="bg-card/90 flex max-w-full flex-wrap items-center justify-end gap-1.5 rounded-xl border p-1.5 shadow-2xl backdrop-blur-lg">
          <button
            onClick={() => setShowControls((v) => !v)}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              !showControls ? "text-primary" : ""
            }`}
            aria-label={t(
              "liveMode.settings.toggleControls",
              "Toggle controls",
            )}
          >
            <Settings2 className="h-4 w-4" />
          </button>

          {showControls && (
            <div className="flex flex-wrap items-center justify-end gap-1.5 border-l pl-1.5">
              <div className="bg-background/50 flex items-center rounded-lg border">
                <button
                  className="flex h-10 w-10 items-center justify-center"
                  onClick={() =>
                    update("zoomLevel", Math.max(0.5, settings.zoomLevel - 0.2))
                  }
                  aria-label={
                    t("liveMode.settings.decreaseSize") ?? "Decrease text size"
                  }
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="w-9 text-center font-mono text-[9px] tabular-nums">
                  {Math.round(settings.zoomLevel * 100)}%
                </span>
                <button
                  className="flex h-10 w-10 items-center justify-center"
                  onClick={() =>
                    update("zoomLevel", Math.min(3, settings.zoomLevel + 0.2))
                  }
                  aria-label={
                    t("liveMode.settings.increaseSize") ?? "Increase text size"
                  }
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
              </div>

              <button
                className="bg-background/50 flex h-10 items-center gap-1 rounded-lg border px-2"
                onClick={() => {
                  const order: FontFamily[] = ["sans", "mono", "serif"];
                  const next =
                    order[
                      (order.indexOf(settings.fontFamily) + 1) % order.length
                    ];
                  update("fontFamily", next);
                }}
                title={t("liveMode.settings.fontLabel") ?? "Font"}
              >
                <Type className="h-3.5 w-3.5" />
                <span className="text-[9px]">
                  {FONT_LABELS[settings.fontFamily]}
                </span>
              </button>

              <button
                onClick={() => update("showChords", !settings.showChords)}
                className={`flex h-10 items-center gap-1 rounded-lg border px-2 text-xs ${
                  settings.showChords ? "bg-secondary" : ""
                }`}
                aria-label={t("liveMode.settings.showChords", "Toggle chords")}
              >
                <Music className="h-3.5 w-3.5" />
              </button>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => update("isAutoScroll", !settings.isAutoScroll)}
                  className={`flex h-10 items-center gap-1 rounded-lg border px-2 text-xs ${
                    settings.isAutoScroll
                      ? "bg-primary text-primary-foreground"
                      : ""
                  }`}
                  aria-label={t(
                    "liveMode.settings.autoScrollTitle",
                    "Toggle auto-scroll",
                  )}
                >
                  {settings.isAutoScroll ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                </button>
                <div className="bg-background/50 flex items-center rounded-lg border">
                  <button
                    className="flex h-10 w-10 items-center justify-center"
                    onClick={() =>
                      update(
                        "scrollSpeed",
                        Math.max(
                          SCROLL_MIN,
                          settings.scrollSpeed - SCROLL_STEP,
                        ),
                      )
                    }
                    aria-label={t(
                      "liveMode.settings.decreaseSpeed",
                      "Decrease speed",
                    )}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-6 text-center font-mono text-[9px] tabular-nums">
                    {settings.scrollSpeed.toFixed(1)}
                  </span>
                  <button
                    className="flex h-10 w-10 items-center justify-center"
                    onClick={() =>
                      update(
                        "scrollSpeed",
                        Math.min(
                          SCROLL_MAX,
                          settings.scrollSpeed + SCROLL_STEP,
                        ),
                      )
                    }
                    aria-label={t(
                      "liveMode.settings.increaseSpeed",
                      "Increase speed",
                    )}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer
        className="bg-card/80 shrink-0 border-t backdrop-blur-md"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        <div className="bg-muted relative h-1.5 w-full overflow-hidden">
          <div
            className="bg-primary absolute inset-y-0 left-0 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="grid grid-cols-3 items-center gap-2 p-3">
          <div>
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="border-input flex h-12 items-center gap-1 rounded-lg border px-4 text-sm font-bold disabled:opacity-40"
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="hidden sm:inline">{t("liveMode.prev")}</span>
            </button>
          </div>

          <div className="overflow-hidden px-1 text-center">
            <p className="text-muted-foreground text-[9px] font-bold tracking-[0.2em] uppercase">
              {t("liveMode.nextSong")}
            </p>
            <p className="truncate text-sm font-bold">
              {nextSong ? nextSong.title : t("liveMode.endOfShow")}
            </p>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleNext}
              disabled={currentIndex === songs.length - 1}
              className="bg-primary text-primary-foreground flex h-12 items-center gap-1 rounded-lg px-4 text-sm font-bold disabled:opacity-40"
            >
              <span className="hidden sm:inline">{t("liveMode.next")}</span>
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
