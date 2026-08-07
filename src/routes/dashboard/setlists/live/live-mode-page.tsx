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
  Check,
} from "lucide-react";
import { setlistsApi, LocalApiError } from "@/lib/local-api";
import { useAuth } from "@/lib/auth-context";
import { usePreferences } from "@/lib/use-preferences";
import { ChordProRenderer } from "@/components/chord-pro-renderer";
import { ErrorView } from "@/components/ui/state-views";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn } from "@/lib/utils";
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
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;

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
  const [isLoadingSetlist, setIsLoadingSetlist] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showSongList, setShowSongList] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );

  const { preferences, isLoading: isLoadingPrefs } = usePreferences(
    session?.user_id,
  );

  const [settings, setSettings] = useState<LiveSettings>({
    zoomLevel: 1,
    fontFamily: "sans",
    showChords: false,
    isAutoScroll: false,
    scrollSpeed: 1,
  });

  useEffect(() => {
    if (preferences) {
      setSettings((s) => ({
        ...s,
        zoomLevel: (preferences.live_mode_font_size ?? 100) / 100,
      }));
    }
  }, [preferences]);

  const scrollContainerRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    if (!session || !id) return;
    setIsLoadingSetlist(true);
    try {
      const [setlistData, setlistSongs] = await Promise.all([
        setlistsApi.get(id, session.user_id),
        setlistsApi.getSongs(id),
      ]);
      setSetlist(setlistData);
      setSongs(setlistSongs);
      setLoadError(null);

      const initialSongId = searchParams.get("songId");
      if (initialSongId) {
        const idx = setlistSongs.findIndex((s) => s.id === initialSongId);
        setCurrentIndex(Math.max(0, idx));
      }
    } catch (err) {
      setLoadError(
        err instanceof LocalApiError
          ? err.message
          : "Failed to load this setlist.",
      );
    } finally {
      setIsLoadingSetlist(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, id]);

  useEffect(() => {
    load();
  }, [load]);

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

  const jumpTo = useCallback((index: number) => {
    setCurrentIndex(index);
    setSettings((s) => ({ ...s, isAutoScroll: false }));
    setShowSongList(false);
  }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const dt = Date.now() - start.time;

    const SWIPE_THRESHOLD = 60;
    const TAP_THRESHOLD = 12;

    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) handleNext();
      else handlePrev();
      return;
    }

    if (
      Math.abs(dx) < TAP_THRESHOLD &&
      Math.abs(dy) < TAP_THRESHOLD &&
      dt < 400
    ) {
      setIsChromeVisible((v) => !v);
    }
  };

  const toggleFullscreen = async () => {
    try {
      const win = getCurrentWindow();
      const fs = await win.isFullscreen();
      await win.setFullscreen(!fs);
      setIsFullscreen(!fs);
    } catch (err) {
      console.error("Fullscreen not supported on this platform:", err);
    }
  };

  useEffect(() => {
    return () => {
      getCurrentWindow()
        .setFullscreen(false)
        .catch(() => {});
    };
  }, []);

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
          if (showSettings) setShowSettings(false);
          else if (showSongList) setShowSongList(false);
          else navigate(`/dashboard/setlists/${id}`);
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrev, navigate, id, showSettings, showSongList]);

  const update = <K extends keyof LiveSettings>(
    key: K,
    value: LiveSettings[K],
  ) => setSettings((s) => ({ ...s, [key]: value }));

  const isLoading = isLoadingSetlist || isLoadingPrefs;

  if (isLoading) {
    return (
      <div className="bg-background fixed inset-0 z-50 flex items-center justify-center">
        <span className="text-muted-foreground text-sm">
          {t("common.loading", "Loading...")}
        </span>
      </div>
    );
  }

  if (loadError || !setlist) {
    return (
      <div
        className="bg-background fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 p-4 text-center"
        style={{
          paddingTop: "calc(var(--safe-top) + 1rem)",
          paddingBottom: "calc(var(--safe-bottom) + 1rem)",
        }}
      >
        <ErrorView message={loadError ?? "Setlist not found."} onRetry={load} />
        <button
          onClick={() => navigate("/dashboard/setlists")}
          className="text-sm underline"
        >
          {t("liveMode.back")}
        </button>
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

  const baseFontSize = 1.55 * settings.zoomLevel;

  return (
    <div
      className="bg-background text-foreground fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{
        paddingLeft: "var(--safe-left)",
        paddingRight: "var(--safe-right)",
      }}
    >
      {isChromeVisible && (
        <header
          className="bg-card/95 supports-backdrop-filter:bg-card/85 z-30 flex shrink-0 flex-col gap-2 border-b backdrop-blur-md"
          style={{
            paddingTop: "calc(var(--safe-top) + 0.5rem)",
            paddingBottom: "0.5rem",
          }}
        >
          <div className="flex items-center gap-2 px-3">
            <button
              onClick={() => navigate(`/dashboard/setlists/${id}`)}
              aria-label={t("common.close", "Close")}
              className="active:bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            >
              <X className="h-5 w-5" />
            </button>

            <button
              onClick={() => setShowSongList(true)}
              aria-label={t("setlists.songs.title")}
              className="active:bg-muted min-w-0 flex-1 rounded-lg px-1 py-0.5 text-center"
            >
              <h1 className="truncate text-base leading-tight font-bold">
                {currentSong.title}
              </h1>
              <p className="text-muted-foreground truncate text-[11px] font-medium tracking-wide">
                {setlist.title} · {currentIndex + 1}/{songs.length}
              </p>
            </button>

            <button
              onClick={toggleFullscreen}
              aria-label={t(
                "liveMode.settings.toggleFullscreen",
                "Toggle fullscreen",
              )}
              className="active:bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            >
              {isFullscreen ? (
                <Minimize className="h-5 w-5" />
              ) : (
                <Maximize className="h-5 w-5" />
              )}
            </button>
          </div>

          {(currentSong.tempo ||
            currentSong.tonality ||
            settings.isAutoScroll) && (
            <div className="flex items-center justify-center gap-2 px-3">
              {currentSong.tempo && (
                <span className="bg-secondary text-secondary-foreground rounded-full px-2.5 py-1 text-xs font-bold tabular-nums">
                  {currentSong.tempo}{" "}
                  <span className="opacity-70">{t("liveMode.bpm")}</span>
                </span>
              )}
              {currentSong.tonality && (
                <span className="bg-primary text-primary-foreground rounded-full px-2.5 py-1 text-xs font-bold">
                  {currentSong.tonality}
                </span>
              )}
              {settings.isAutoScroll && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <Play className="h-3 w-3 fill-current" />
                  {settings.scrollSpeed.toFixed(1)}x
                </span>
              )}
            </div>
          )}
        </header>
      )}

      <main
        ref={scrollContainerRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="flex-1 overflow-auto scroll-smooth px-4 pt-4 pb-8 md:px-12"
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

      {isChromeVisible && (
        <footer
          className="bg-card/95 supports-backdrop-filter:bg-card/85 z-30 shrink-0 border-t backdrop-blur-md"
          style={{ paddingBottom: "var(--safe-bottom)" }}
        >
          <button
            onClick={() => setShowSongList(true)}
            className="bg-muted relative block h-1.5 w-full overflow-hidden"
            aria-label={t("setlists.songs.title")}
          >
            <div
              className="bg-primary absolute inset-y-0 left-0 transition-all"
              style={{ width: `${progress}%` }}
            />
          </button>

          <div className="grid grid-cols-4 items-center gap-1.5 p-2">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              aria-label={t("liveMode.prev")}
              className="border-input active:bg-muted flex h-14 items-center justify-center rounded-xl border disabled:opacity-30"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>

            <button
              onClick={() => update("isAutoScroll", !settings.isAutoScroll)}
              aria-label={t("liveMode.settings.autoScrollTitle")}
              className={cn(
                "flex h-14 items-center justify-center rounded-xl border",
                settings.isAutoScroll
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-input active:bg-muted",
              )}
            >
              {settings.isAutoScroll ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5" />
              )}
            </button>

            <button
              onClick={() => setShowSettings(true)}
              aria-label={t("settings.title")}
              className="border-input active:bg-muted flex h-14 items-center justify-center rounded-xl border"
            >
              <Settings2 className="h-5 w-5" />
            </button>

            <button
              onClick={handleNext}
              disabled={currentIndex === songs.length - 1}
              aria-label={t("liveMode.next")}
              className="bg-primary text-primary-foreground flex h-14 items-center justify-center rounded-xl disabled:opacity-30"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>

          {nextSong && (
            <p className="text-muted-foreground truncate px-3 pb-2 text-center text-[11px] font-medium tracking-wide">
              {t("liveMode.nextSong")}:{" "}
              <span className="text-foreground font-semibold">
                {nextSong.title}
              </span>
            </p>
          )}
        </footer>
      )}

      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/50"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="bg-background w-full space-y-5 rounded-t-2xl p-4"
            style={{ paddingBottom: "calc(var(--safe-bottom) + 1rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-muted mx-auto h-1.5 w-10 rounded-full" />
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("settings.title")}</h2>
              <button
                onClick={() => setShowSettings(false)}
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {t("liveMode.settings.textSize", "Tamanho do texto")}
              </p>
              <div className="flex items-center justify-between gap-3 rounded-xl border p-2">
                <button
                  onClick={() =>
                    update(
                      "zoomLevel",
                      Math.max(ZOOM_MIN, settings.zoomLevel - ZOOM_STEP),
                    )
                  }
                  aria-label={t("liveMode.settings.decreaseSize") ?? "Decrease"}
                  className="active:bg-muted flex h-12 w-12 items-center justify-center rounded-lg"
                >
                  <ZoomOut className="h-5 w-5" />
                </button>
                <span className="min-w-14 text-center font-mono text-base font-semibold tabular-nums">
                  {Math.round(settings.zoomLevel * 100)}%
                </span>
                <button
                  onClick={() =>
                    update(
                      "zoomLevel",
                      Math.min(ZOOM_MAX, settings.zoomLevel + ZOOM_STEP),
                    )
                  }
                  aria-label={t("liveMode.settings.increaseSize") ?? "Increase"}
                  className="active:bg-muted flex h-12 w-12 items-center justify-center rounded-lg"
                >
                  <ZoomIn className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  const order: FontFamily[] = ["sans", "mono", "serif"];
                  const next =
                    order[
                      (order.indexOf(settings.fontFamily) + 1) % order.length
                    ];
                  update("fontFamily", next);
                }}
                className="active:bg-muted flex h-14 flex-col items-center justify-center gap-1 rounded-xl border"
              >
                <Type className="h-4 w-4" />
                <span className="text-xs font-medium">
                  {FONT_LABELS[settings.fontFamily]}
                </span>
              </button>

              <button
                onClick={() => update("showChords", !settings.showChords)}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-1 rounded-xl border",
                  settings.showChords
                    ? "bg-secondary border-secondary"
                    : "active:bg-muted",
                )}
              >
                <Music className="h-4 w-4" />
                <span className="text-xs font-medium">
                  {settings.showChords
                    ? t("liveMode.settings.chordsOn", "Acordes")
                    : t("liveMode.settings.chordsOff", "Sem acordes")}
                </span>
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {t("liveMode.settings.scroll", "Rolagem automática")}
              </p>
              <div className="flex items-center justify-between gap-3 rounded-xl border p-2">
                <button
                  onClick={() => update("isAutoScroll", !settings.isAutoScroll)}
                  aria-label={t("liveMode.settings.autoScrollTitle")}
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-lg",
                    settings.isAutoScroll
                      ? "bg-primary text-primary-foreground"
                      : "active:bg-muted",
                  )}
                >
                  {settings.isAutoScroll ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5" />
                  )}
                </button>

                <button
                  onClick={() =>
                    update(
                      "scrollSpeed",
                      Math.max(SCROLL_MIN, settings.scrollSpeed - SCROLL_STEP),
                    )
                  }
                  aria-label={t("liveMode.settings.decreaseSpeed")}
                  className="active:bg-muted flex h-12 w-12 items-center justify-center rounded-lg"
                >
                  <Minus className="h-5 w-5" />
                </button>
                <span className="min-w-10 text-center font-mono text-base font-semibold tabular-nums">
                  {settings.scrollSpeed.toFixed(1)}x
                </span>
                <button
                  onClick={() =>
                    update(
                      "scrollSpeed",
                      Math.min(SCROLL_MAX, settings.scrollSpeed + SCROLL_STEP),
                    )
                  }
                  aria-label={t("liveMode.settings.increaseSpeed")}
                  className="active:bg-muted flex h-12 w-12 items-center justify-center rounded-lg"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSongList && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/50"
          onClick={() => setShowSongList(false)}
        >
          <div
            className="bg-background flex max-h-[75vh] w-full flex-col rounded-t-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full" />
            <div className="flex shrink-0 items-center justify-between p-4 pb-2">
              <h2 className="truncate text-lg font-semibold">
                {setlist.title}
              </h2>
              <button
                onClick={() => setShowSongList(false)}
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul
              className="overflow-y-auto"
              style={{ paddingBottom: "calc(var(--safe-bottom) + 0.5rem)" }}
            >
              {songs.map((song, index) => (
                <li key={song.id} className="border-b last:border-b-0">
                  <button
                    onClick={() => jumpTo(index)}
                    className={cn(
                      "active:bg-muted flex w-full items-center gap-3 px-4 py-3 text-left",
                      index === currentIndex && "bg-primary/10",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        index === currentIndex
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {index === currentIndex ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm font-medium",
                          index === currentIndex &&
                            "text-primary font-semibold",
                        )}
                      >
                        {song.title}
                      </p>
                      {(song.tonality || song.tempo) && (
                        <p className="text-muted-foreground truncate text-xs">
                          {song.tonality ?? ""}
                          {song.tonality && song.tempo ? " · " : ""}
                          {song.tempo
                            ? `${song.tempo} ${t("liveMode.bpm")}`
                            : ""}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
