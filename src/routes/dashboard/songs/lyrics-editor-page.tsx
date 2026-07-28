import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Save, Eye, EyeOff, Music, Loader2 } from "lucide-react";
import { songsApi, LocalApiError } from "@/lib/local-api";
import { useAuth } from "@/lib/auth-context";
import { ChordProRenderer } from "@/components/chord-pro-renderer";

function insertAtCursor(
  textarea: HTMLTextAreaElement,
  insertion: string,
  setText: (v: string) => void,
) {
  const { selectionStart: start, value } = textarea;
  const next = value.slice(0, start) + insertion + value.slice(start);
  setText(next);
  requestAnimationFrame(() => {
    textarea.focus();
    const pos = start + insertion.length;
    textarea.setSelectionRange(pos, pos);
  });
}

export default function LyricsEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { t } = useTranslation();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [songTitle, setSongTitle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [showChords, setShowChords] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!session || !id) return;
      try {
        const songs = await songsApi.list(session.user_id);
        const song = songs.find((s) => s.id === id);
        if (!song) throw new Error("not found");
        if (mounted) {
          setSongTitle(song.title);
          setLyrics(song.lyrics ?? "");
        }
      } catch {
        if (mounted) {
          toast.error("Could not load this song.");
          navigate("/dashboard/songs");
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [id, session, navigate]);

  const handleSave = useCallback(() => {
    if (!session || !id) return;
    setIsSaving(true);
    songsApi
      .update(id, session.user_id, { lyrics })
      .then(() => {
        toast.success(t("lyrics.saved"));
        navigate(-1);
      })
      .catch((err) => {
        toast.error(
          err instanceof LocalApiError ? err.message : t("lyrics.saveFailed"),
        );
      })
      .finally(() => setIsSaving(false));
  }, [id, session, lyrics, navigate, t]);

  const insertChord = useCallback((chord: string) => {
    if (textareaRef.current)
      insertAtCursor(textareaRef.current, `[${chord}]`, setLyrics);
  }, []);

  const insertSection = useCallback((template: string) => {
    if (textareaRef.current)
      insertAtCursor(textareaRef.current, template, setLyrics);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave],
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-primary h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-0 sm:h-[calc(100vh-2rem)]">
      <div className="flex items-center justify-between border-b px-2 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="shrink-0 rounded-lg border p-2"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-base leading-tight font-semibold">
              {songTitle}
            </h1>
            <p className="text-muted-foreground text-xs">
              {t("lyrics.editTitle")}
            </p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-primary text-primary-foreground flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium disabled:opacity-60"
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {t("lyrics.save")}
        </button>
      </div>

      <div className="bg-muted/30 flex flex-wrap items-center gap-1 border-b px-2 py-2">
        <button
          onClick={() => insertSection("{soc}\n\n{eoc}\n")}
          className="h-8 rounded-lg border px-2 text-xs font-medium"
        >
          {t("lyrics.toolbar.chorus")}
        </button>
        <button
          onClick={() => insertSection("{sov: Verse 1}\n\n{eov}\n")}
          className="h-8 rounded-lg border px-2 text-xs font-medium"
        >
          {t("lyrics.toolbar.verse")}
        </button>
        <button
          onClick={() => insertSection("{sob}\n\n{eob}\n")}
          className="h-8 rounded-lg border px-2 text-xs font-medium"
        >
          {t("lyrics.toolbar.bridge")}
        </button>
        <button
          onClick={() => {
            const chord = window.prompt(
              t("lyrics.toolbar.customChord") ?? "Chord",
            );
            if (chord?.trim()) insertChord(chord.trim());
          }}
          className="flex h-8 items-center gap-1 rounded-lg border px-2 text-xs font-medium"
        >
          <Music className="h-3.5 w-3.5" /> {t("lyrics.toolbar.chord")}
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setShowPreview((v) => !v)}
            className={`flex h-8 items-center gap-1 rounded-lg border px-2 text-xs font-medium ${
              showPreview ? "bg-secondary" : ""
            }`}
          >
            {showPreview ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
            {t("lyrics.preview")}
          </button>
          {showPreview && (
            <button
              onClick={() => setShowChords((v) => !v)}
              className={`flex h-8 items-center gap-1 rounded-lg border px-2 text-xs font-medium ${
                showChords ? "bg-secondary" : ""
              }`}
            >
              <Music className="h-3.5 w-3.5" /> {t("lyrics.toolbar.chords")}
            </button>
          )}
        </div>
      </div>

      <div
        className={`flex flex-1 overflow-hidden ${showPreview ? "flex-col divide-y sm:flex-row sm:divide-x sm:divide-y-0" : ""}`}
      >
        <div
          className={
            showPreview
              ? "flex h-1/2 flex-col sm:h-full sm:w-1/2"
              : "flex h-full w-full flex-col"
          }
        >
          <textarea
            ref={textareaRef}
            className="bg-background placeholder:text-muted-foreground/50 flex-1 resize-none p-3 font-mono text-sm leading-relaxed focus:outline-none"
            placeholder={
              "[Am]Type the [G]lyrics in ChordPro format\n\n{soc}\n[Am]Chorus [G]here\n{eoc}"
            }
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
          <div className="text-muted-foreground border-t px-3 py-1.5 text-xs">
            {t("lyrics.stats", {
              lines: lyrics.split("\n").length,
              chars: lyrics.length,
            })}
          </div>
        </div>

        {showPreview && (
          <div className="bg-muted/20 h-1/2 overflow-y-auto p-4 sm:h-full sm:w-1/2">
            <ChordProRenderer
              content={lyrics}
              showChords={showChords}
              fontSize={1}
              fontFamily="sans"
            />
          </div>
        )}
      </div>
    </div>
  );
}
