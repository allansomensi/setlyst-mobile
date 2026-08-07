import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, WifiOff, X } from "lucide-react";
import { artistsApi, LocalApiError } from "@/lib/local-api";
import { useAuth } from "@/lib/auth-context";
import { useAsyncData } from "@/lib/use-async-data";
import { LoadingView, ErrorView } from "@/components/ui/state-views";
import type { Artist } from "@/types/api";
import { ActionMenuButton } from "@/components/ui/action-sheet";

export default function ArtistsPage() {
  const { t } = useTranslation();
  const { session, isLoading: authLoading } = useAuth();

  const {
    data: artists,
    status,
    error,
    reload,
  } = useAsyncData<Artist[]>(
    session ? () => artistsApi.list(session.user_id) : null,
    [session?.user_id],
  );

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingArtist, setEditingArtist] = useState<Artist | null>(null);
  const [artistToDelete, setArtistToDelete] = useState<Artist | null>(null);
  const [name, setName] = useState("");

  const openCreate = () => {
    setEditingArtist(null);
    setName("");
    setIsFormOpen(true);
  };

  const openEdit = (artist: Artist) => {
    setEditingArtist(artist);
    setName(artist.name);
    setIsFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!session || !name.trim()) return;
    try {
      if (editingArtist) {
        await artistsApi.update(editingArtist.id, session.user_id, {
          name: name.trim(),
        });
        toast.success(t("artists.dialog.updated"));
      } else {
        await artistsApi.create(session.user_id, { name: name.trim() });
        toast.success(t("artists.dialog.created"));
      }
      setIsFormOpen(false);
      await reload();
    } catch (err) {
      toast.error(
        err instanceof LocalApiError
          ? err.message
          : t("artists.dialog.saveFailed"),
      );
    }
  };

  const confirmDelete = async () => {
    if (!session || !artistToDelete) return;
    try {
      await artistsApi.remove(artistToDelete.id, session.user_id);
      await reload();
      toast.success(t("artists.dialog.deletedOffline"));
    } catch (err) {
      toast.error(
        err instanceof LocalApiError
          ? err.message
          : t("artists.dialog.deleteFailed"),
      );
    } finally {
      setArtistToDelete(null);
    }
  };

  const list = artists ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("artists.title")}</h1>
        <button
          onClick={openCreate}
          className="bg-primary text-primary-foreground flex h-9 items-center gap-1 rounded-lg px-3 text-sm"
        >
          <Plus className="h-4 w-4" /> {t("common.add")}
        </button>
      </div>

      {authLoading || status === "loading" ? (
        <LoadingView />
      ) : status === "error" ? (
        <ErrorView message={error ?? ""} onRetry={reload} />
      ) : (
        <ul className="divide-y rounded-lg border">
          {list.length === 0 && (
            <li className="text-muted-foreground p-4 text-center text-sm">
              {t("artists.emptyOffline")}
            </li>
          )}
          {list.map((artist) => (
            <li
              key={artist.id}
              className="flex items-center justify-between p-3"
            >
              <span className="flex items-center gap-2">
                {artist.name}
                {artist.dirty && (
                  <WifiOff
                    className="text-muted-foreground h-3.5 w-3.5"
                    aria-label={t("common.notSynced")}
                  />
                )}
              </span>
              <div className="flex items-center gap-1">
                <ActionMenuButton
                  items={[
                    {
                      label: t("common.edit"),
                      icon: Pencil,
                      onClick: () => openEdit(artist),
                    },
                    {
                      label: t("common.delete"),
                      icon: Trash2,
                      destructive: true,
                      onClick: () => setArtistToDelete(artist),
                    },
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="bg-background w-full max-w-md space-y-4 rounded-t-xl p-4 sm:rounded-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingArtist
                  ? t("artists.dialog.editTitle")
                  : t("artists.dialog.addTitle")}
              </h2>
              <button
                onClick={() => setIsFormOpen(false)}
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <input
              className="border-input h-9 w-full rounded-lg border px-3 text-sm"
              placeholder={t("artists.dialog.nameLabel")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsFormOpen(false)}
                className="h-9 rounded-lg border px-3 text-sm"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSubmit}
                disabled={!name.trim()}
                className="bg-primary text-primary-foreground h-9 rounded-lg px-3 text-sm disabled:opacity-50"
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {artistToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background w-full max-w-sm space-y-4 rounded-xl p-4">
            <h2 className="text-lg font-semibold">
              {t("artists.dialog.deleteConfirm")}
            </h2>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setArtistToDelete(null)}
                className="h-9 rounded-lg border px-3 text-sm"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground h-9 rounded-lg px-3 text-sm"
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
