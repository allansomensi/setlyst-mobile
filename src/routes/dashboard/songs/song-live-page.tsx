import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  X,
  ZoomIn,
  ZoomOut,
  Settings2,
  Music,
  Type,
  Minimize,
  Maximize,
  Play,
  Pause,
  Minus,
  Plus,
} from "lucide-react";
import { preferencesApi, songsApi } from "@/lib/local-api";
import { useAuth } from "@/lib/auth-context";
import { ChordProRenderer } from "@/components/chord-pro-renderer";
import type { Song } from "@/types/api";
import { getCurrentWindow } from "@tauri-apps/api/window";

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

export default function SongLivePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { t } = useTranslation();

  const FONT_LABELS: Record<FontFamily, string> = {
    sans: t("liveMode.settings.fonts.sans", "Sans"),
    mono: t("liveMode.settings.fonts.mono", "Mono"),
    serif: t("liveMode.settings.fonts.serif", "Serif"),
  };

  const [song, setSong] = useState<Song | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(false);

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
    const [songs, prefs] = await Promise.all([
      songsApi.list(session.user_id),
      preferencesApi.get(session.user_id),
    ]);
    setSong(songs.find((s) => s.id === id) ?? null);
    setSettings((s) => ({
      ...s,
      zoomLevel: (prefs.live_mode_font_size ?? 100) / 100,
    }));
    setIsLoading(false);
  }, [session, id]);

  useEffect(() => {
    load();
  }, [load]);

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

  // Auto-scroll logic
  useEffect(() => {
    if (!settings.isAutoScroll) return;
    const interval = setInterval(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop += settings.scrollSpeed;
      }
    }, SCROLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [settings.isAutoScroll, settings.scrollSpeed]);

  // Keep the screen awake
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      switch (e.key) {
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
          navigate(-1);
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  const update = <K extends keyof LiveSettings>(
    key: K,
    value: LiveSettings[K],
  ) => setSettings((s) => ({ ...s, [key]: value }));

  if (isLoading || !song) {
    return (
      <div className="bg-background fixed inset-0 z-50 flex items-center justify-center">
        <span className="text-muted-foreground text-sm">
          {t("common.loading", "Loading...")}
        </span>
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
            onClick={() => navigate(-1)}
            aria-label={t("common.close", "Close")}
            className="active:bg-muted flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1 text-center">
            <h1 className="truncate text-lg leading-tight font-bold">
              {song.title}
            </h1>
          </div>

          <button
            onClick={toggleFullscreen}
            aria-label={t(
              "liveMode.settings.toggleFullscreen",
              "Toggle fullscreen",
            )}
            className="active:bg-muted flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
          >
            {isFullscreen ? (
              <Minimize className="h-5 w-5" />
            ) : (
              <Maximize className="h-5 w-5" />
            )}
          </button>
        </div>

        {(song.tempo || song.tonality) && (
          <div className="flex items-center justify-center gap-2">
            {song.tempo && (
              <span className="bg-secondary text-secondary-foreground rounded-md px-2.5 py-1 text-xs font-bold tabular-nums">
                {song.tempo}
                <span className="ml-1 opacity-70">
                  {t("liveMode.bpm", "BPM")}
                </span>
              </span>
            )}
            {song.tonality && (
              <span className="bg-primary text-primary-foreground rounded-md px-2.5 py-1 text-xs font-bold">
                {song.tonality}
              </span>
            )}
          </div>
        )}
      </header>

      <main
        ref={scrollContainerRef}
        className="flex-1 overflow-auto scroll-smooth p-4 md:p-12"
      >
        <div className="mx-auto max-w-5xl">
          <ChordProRenderer
            content={song.lyrics ?? ""}
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
    </div>
  );
}
