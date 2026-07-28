import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, FileEdit, WifiOff, X } from "lucide-react";
import { songsApi, artistsApi, LocalApiError } from "@/lib/local-api";
import { useAuth } from "@/lib/auth-context";
import { TONALITIES, GENRES } from "@/types/api";
import type { Song, Artist } from "@/types/api";

interface SongFormData {
  title: string;
  artist_id: string;
  tempo: number | null;
  tonality: string;
  genre: string;
}

export default function SongsPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [songs, setSongs] = useState<Song[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSong, setEditingSong] = useState<Song | null>(null);

  const reload = useCallback(async () => {
    if (!session) return;
    const [songsData, artistsData] = await Promise.all([
      songsApi.list(session.user_id),
      artistsApi.list(session.user_id),
    ]);
    setSongs(songsData);
    setArtists(artistsData);
  }, [session]);

  useEffect(() => {
    reload();
  }, [reload]);

  const getArtistName = (artistId: string) =>
    artists.find((a) => a.id === artistId)?.name ??
    t("songs.unknownArtist", "Unknown artist");

  const openCreate = () => {
    setEditingSong(null);
    setIsFormOpen(true);
  };

  const openEdit = (song: Song) => {
    setEditingSong(song);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!session) return;
    try {
      await songsApi.remove(id, session.user_id);
      await reload();
      toast.success(t("songs.dialog.deletedOffline"));
    } catch (err) {
      toast.error(
        err instanceof LocalApiError
          ? err.message
          : t("songs.dialog.deleteFailed"),
      );
    }
  };

  const handleSubmit = async (data: SongFormData) => {
    if (!session) return;
    const payload = {
      title: data.title.trim(),
      artist_id: data.artist_id,
      tempo: data.tempo,
      tonality: data.tonality || null,
      genre: data.genre || null,
    };

    try {
      let savedId: string;
      if (editingSong) {
        const updated = await songsApi.update(
          editingSong.id,
          session.user_id,
          payload,
        );
        savedId = updated.id;
        toast.success(t("songs.dialog.updated"));
      } else {
        const created = await songsApi.create(session.user_id, payload);
        savedId = created.id;
        toast.success(t("songs.dialog.createdWithLyricsInfo"));
      }
      setIsFormOpen(false);
      await reload();
      void savedId;
    } catch (err) {
      toast.error(
        err instanceof LocalApiError
          ? err.message
          : t("songs.dialog.saveFailed"),
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("songs.title")}</h1>
        <button
          onClick={openCreate}
          disabled={artists.length === 0}
          className="bg-primary text-primary-foreground flex h-9 items-center gap-1 rounded-lg px-3 text-sm disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> {t("common.add", "Add")}
        </button>
      </div>

      {artists.length === 0 && (
        <p className="text-muted-foreground text-sm">
          {t("songs.requireArtist")}
        </p>
      )}

      <ul className="divide-y rounded-lg border">
        {songs.length === 0 && (
          <li className="text-muted-foreground p-4 text-center text-sm">
            {t("songs.empty")}
          </li>
        )}
        {songs.map((song) => (
          <li
            key={song.id}
            className="flex items-center justify-between gap-2 p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{song.title}</span>
                {song.dirty && (
                  <WifiOff
                    className="text-muted-foreground h-3.5 w-3.5 shrink-0"
                    aria-label={t("common.notSynced", "Not yet synced")}
                  />
                )}
                {song.lyrics && (
                  <span className="bg-primary/10 text-primary rounded px-1 py-0.5 text-[10px] font-medium">
                    {t("songs.lyricsTag")}
                  </span>
                )}
              </div>
              <p className="text-muted-foreground truncate text-xs">
                {getArtistName(song.artist_id)}
                {song.tonality ? ` · ${song.tonality}` : ""}
                {song.tempo ? ` · ${song.tempo} BPM` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => openEdit(song)}
                aria-label={t("songs.menu.editDetails")}
                className="p-1.5"
                title={t("songs.menu.editDetails")}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <Link
                to={`/dashboard/songs/${song.id}/lyrics`}
                aria-label={t("songs.menu.editLyrics")}
                className="p-1.5"
                title={t("songs.menu.editLyrics")}
              >
                <FileEdit className="h-4 w-4" />
              </Link>
              <button
                onClick={() => handleDelete(song.id)}
                aria-label={t("common.delete")}
                className="p-1.5"
              >
                <Trash2 className="text-destructive h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {isFormOpen && (
        <SongFormModal
          song={editingSong}
          artists={artists}
          onClose={() => setIsFormOpen(false)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

function SongFormModal({
  song,
  artists,
  onClose,
  onSubmit,
}: {
  song: Song | null;
  artists: Artist[];
  onClose: () => void;
  onSubmit: (data: SongFormData) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(song?.title ?? "");
  const [artistId, setArtistId] = useState(
    song?.artist_id ?? artists[0]?.id ?? "",
  );
  const [tempo, setTempo] = useState(song?.tempo?.toString() ?? "");
  const [tonality, setTonality] = useState(song?.tonality ?? "");
  const [genre, setGenre] = useState(song?.genre ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="bg-background max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-xl p-4 sm:rounded-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {song ? t("songs.dialog.editTitle") : t("songs.dialog.addTitle")}
          </h2>
          <button onClick={onClose} aria-label={t("common.close", "Close")}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">
              {t("songs.dialog.titleLabel")}
            </label>
            <input
              className="border-input mt-1 h-9 w-full rounded-lg border px-3 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-medium">
              {t("songs.dialog.artistLabel")}
            </label>
            <select
              className="border-input mt-1 h-9 w-full rounded-lg border px-3 text-sm"
              value={artistId}
              onChange={(e) => setArtistId(e.target.value)}
            >
              {artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-sm font-medium">
                {t("songs.dialog.keyLabel")}
              </label>
              <select
                className="border-input mt-1 h-9 w-full rounded-lg border px-2 text-sm"
                value={tonality}
                onChange={(e) => setTonality(e.target.value)}
              >
                <option value="">{t("songs.dialog.noneOption")}</option>
                {TONALITIES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">
                {t("songs.dialog.genreLabel")}
              </label>
              <select
                className="border-input mt-1 h-9 w-full rounded-lg border px-2 text-sm"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
              >
                <option value="">{t("songs.dialog.noneOption")}</option>
                {GENRES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">
                {t("songs.dialog.bpmLabel")}
              </label>
              <input
                type="number"
                className="border-input mt-1 h-9 w-full rounded-lg border px-2 text-sm"
                value={tempo}
                onChange={(e) => setTempo(e.target.value)}
              />
            </div>
          </div>

          {song && (
            <p className="text-muted-foreground text-xs">
              {t("songs.dialog.lyricsHint")}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="h-9 rounded-lg border px-3 text-sm"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={() =>
              onSubmit({
                title,
                artist_id: artistId,
                tempo: tempo ? Number(tempo) : null,
                tonality,
                genre,
              })
            }
            disabled={!title.trim() || !artistId}
            className="bg-primary text-primary-foreground h-9 rounded-lg px-3 text-sm disabled:opacity-50"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
