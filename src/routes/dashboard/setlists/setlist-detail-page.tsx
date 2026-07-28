import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowLeft,
  Play,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Clock,
  X,
} from "lucide-react";
import {
  setlistsApi,
  songsApi,
  artistsApi,
  LocalApiError,
} from "@/lib/local-api";
import { useAuth } from "@/lib/auth-context";
import { formatDuration } from "@/lib/utils";
import type { Setlist, Song, Artist } from "@/types/api";

export default function SetlistDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();

  const [setlist, setSetlist] = useState<Setlist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [allSongs, setAllSongs] = useState<Song[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedSongId, setSelectedSongId] = useState("");
  const [songToRemove, setSongToRemove] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!session || !id) return;
    const [setlistData, setlistSongs, songsData, artistsData] =
      await Promise.all([
        setlistsApi.get(id, session.user_id),
        setlistsApi.getSongs(id),
        songsApi.list(session.user_id),
        artistsApi.list(session.user_id),
      ]);
    setSetlist(setlistData);
    setSongs(setlistSongs);
    setAllSongs(songsData);
    setArtists(artistsData);
    setIsLoading(false);
  }, [session, id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const getArtistName = (artistId: string) =>
    artists.find((a) => a.id === artistId)?.name ??
    t("songs.unknownArtist", "Unknown artist");

  const availableSongs = allSongs.filter(
    (s) => !songs.some((existing) => existing.id === s.id),
  );

  const handleAddSong = async () => {
    if (!id || !selectedSongId) return;
    try {
      await setlistsApi.addSong(id, selectedSongId, songs.length + 1);
      setSelectedSongId("");
      setIsAddOpen(false);
      await reload();
      toast.success(t("setlists.songs.addDialog.added"));
    } catch (err) {
      toast.error(
        err instanceof LocalApiError
          ? err.message
          : t("setlists.songs.addDialog.addFailed"),
      );
    }
  };

  const confirmRemove = async () => {
    if (!id || !songToRemove) return;
    try {
      await setlistsApi.removeSong(id, songToRemove);
      await reload();
      toast.success(t("setlists.songs.removed"));
    } catch (err) {
      toast.error(
        err instanceof LocalApiError
          ? err.message
          : t("setlists.songs.removeFailed", "Failed to remove song"),
      );
    } finally {
      setSongToRemove(null);
    }
  };

  const moveSong = async (index: number, direction: -1 | 1) => {
    if (!id) return;
    const target = index + direction;
    if (target < 0 || target >= songs.length) return;

    const reordered = [...songs];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    setSongs(reordered);

    try {
      await setlistsApi.reorder(
        id,
        reordered.map((s) => s.id),
      );
    } catch (err) {
      toast.error(
        err instanceof LocalApiError
          ? err.message
          : t("setlists.songs.reorderFailed", "Failed to reorder"),
      );
      await reload();
    }
  };

  const totalDuration = songs.reduce((acc, s) => acc + (s.duration ?? 0), 0);

  if (isLoading || !setlist) {
    return (
      <div className="text-muted-foreground flex h-40 items-center justify-center text-sm">
        {t("common.loading", "Loading...")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate("/dashboard/setlists")}
          aria-label={t("common.back", "Back")}
          className="mt-1 rounded-lg border p-2"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold">{setlist.title}</h1>
          {setlist.description && (
            <p className="text-muted-foreground text-sm">
              {setlist.description}
            </p>
          )}
          <div className="text-muted-foreground bg-muted/50 mt-2 flex w-fit items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium">
            <Clock className="h-3.5 w-3.5" />
            {formatDuration(totalDuration)}
          </div>
        </div>
      </div>

      <Link
        to={`/dashboard/setlists/${setlist.id}/live`}
        className="bg-primary text-primary-foreground flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold"
      >
        <Play className="h-4 w-4" /> {t("setlists.liveModeBtn")}
      </Link>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("setlists.songs.title")}</h2>
        <button
          onClick={() => setIsAddOpen(true)}
          disabled={availableSongs.length === 0}
          className="flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> {t("common.add", "Add")}
        </button>
      </div>

      <ul className="divide-y rounded-lg border">
        {songs.length === 0 && (
          <li className="text-muted-foreground p-4 text-center text-sm">
            {t("setlists.songs.empty")}
          </li>
        )}
        {songs.map((song, index) => (
          <li key={song.id} className="flex items-center gap-2 p-3">
            <span className="text-muted-foreground w-5 text-sm font-medium">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{song.title}</p>
              <p className="text-muted-foreground truncate text-xs">
                {getArtistName(song.artist_id)}
                {song.tonality ? ` · ${song.tonality}` : ""}
                {song.tempo ? ` · ${song.tempo} BPM` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                onClick={() => moveSong(index, -1)}
                disabled={index === 0}
                aria-label={t("common.moveUp", "Move up")}
                className="p-1 disabled:opacity-30"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                onClick={() => moveSong(index, 1)}
                disabled={index === songs.length - 1}
                aria-label={t("common.moveDown", "Move down")}
                className="p-1 disabled:opacity-30"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
              <button
                onClick={() => setSongToRemove(song.id)}
                aria-label={t("common.remove", "Remove")}
                className="p-1"
              >
                <Trash2 className="text-destructive h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="bg-background w-full max-w-md space-y-4 rounded-t-xl p-4 sm:rounded-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {t("setlists.songs.addDialog.title")}
              </h2>
              <button
                onClick={() => setIsAddOpen(false)}
                aria-label={t("common.close", "Close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <select
              className="border-input h-9 w-full rounded-lg border px-3 text-sm"
              value={selectedSongId}
              onChange={(e) => setSelectedSongId(e.target.value)}
            >
              <option value="" disabled>
                {availableSongs.length === 0
                  ? t("setlists.songs.addDialog.noMoreSongs")
                  : t("setlists.songs.addDialog.selectSong")}
              </option>
              {availableSongs.map((song) => (
                <option key={song.id} value={song.id}>
                  {song.title} - {getArtistName(song.artist_id)}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsAddOpen(false)}
                className="h-9 rounded-lg border px-3 text-sm"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleAddSong}
                disabled={!selectedSongId}
                className="bg-primary text-primary-foreground h-9 rounded-lg px-3 text-sm disabled:opacity-50"
              >
                {t("setlists.songs.addDialog.addButton")}
              </button>
            </div>
          </div>
        </div>
      )}

      {songToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background w-full max-w-sm space-y-4 rounded-xl p-4">
            <h2 className="text-lg font-semibold">
              {t("setlists.songs.removeConfirm")}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t(
                "setlists.songs.removeWarning",
                "It will be removed from this setlist. This cannot be undone.",
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSongToRemove(null)}
                className="h-9 rounded-lg border px-3 text-sm"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={confirmRemove}
                className="bg-destructive text-destructive-foreground h-9 rounded-lg px-3 text-sm"
              >
                {t("common.remove", "Remove")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
