import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, ChevronRight, WifiOff, X } from "lucide-react";
import { Link } from "react-router-dom";
import { setlistsApi, LocalApiError } from "@/lib/local-api";
import { useAuth } from "@/lib/auth-context";
import { formatDuration } from "@/lib/utils";
import type { Setlist } from "@/types/api";
import { ActionMenuButton } from "@/components/ui/action-sheet";

export default function SetlistsPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSetlist, setEditingSetlist] = useState<Setlist | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [setlistToDelete, setSetlistToDelete] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!session) return;
    const data = await setlistsApi.list(session.user_id);
    setSetlists(data);
  }, [session]);

  useEffect(() => {
    reload();
  }, [reload]);

  const openCreate = () => {
    setEditingSetlist(null);
    setTitle("");
    setDescription("");
    setIsFormOpen(true);
  };

  const openEdit = (setlist: Setlist) => {
    setEditingSetlist(setlist);
    setTitle(setlist.title);
    setDescription(setlist.description ?? "");
    setIsFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!session || !title.trim()) return;
    try {
      if (editingSetlist) {
        await setlistsApi.update(editingSetlist.id, session.user_id, {
          title: title.trim(),
          description: description.trim(),
        });
        toast.success(t("setlists.dialog.updated"));
      } else {
        await setlistsApi.create(session.user_id, {
          title: title.trim(),
          description: description.trim(),
        });
        toast.success(t("setlists.dialog.created"));
      }
      setIsFormOpen(false);
      await reload();
    } catch (err) {
      toast.error(
        err instanceof LocalApiError
          ? err.message
          : t("setlists.dialog.saveFailed"),
      );
    }
  };

  const confirmDelete = async () => {
    if (!session || !setlistToDelete) return;
    try {
      await setlistsApi.remove(setlistToDelete, session.user_id);
      await reload();
      toast.success(t("setlists.dialog.deleted"));
    } catch (err) {
      toast.error(
        err instanceof LocalApiError
          ? err.message
          : t("setlists.dialog.deleteFailed", "Erro ao excluir a setlist"),
      );
    } finally {
      setSetlistToDelete(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("setlists.title")}</h1>
        <button
          onClick={openCreate}
          className="bg-primary text-primary-foreground flex h-9 items-center gap-1 rounded-lg px-3 text-sm"
        >
          <Plus className="h-4 w-4" /> {t("common.add", "Add")}
        </button>
      </div>

      <ul className="divide-y rounded-lg border">
        {setlists.length === 0 && (
          <li className="text-muted-foreground p-4 text-center text-sm">
            {t("setlists.empty")}
          </li>
        )}
        {setlists.map((setlist) => (
          <li
            key={setlist.id}
            className="flex items-center justify-between gap-2 p-3"
          >
            <Link
              to={`/dashboard/setlists/${setlist.id}`}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{setlist.title}</span>
                  {setlist.dirty && (
                    <WifiOff
                      className="text-muted-foreground h-3.5 w-3.5 shrink-0"
                      aria-label={t("common.notSynced", "Not yet synced")}
                    />
                  )}
                </div>
                <p className="text-muted-foreground truncate text-xs">
                  {formatDuration(setlist.total_duration)}
                  {setlist.description ? ` · ${setlist.description}` : ""}
                </p>
              </div>
              <ChevronRight className="text-muted-foreground ml-auto h-4 w-4 shrink-0" />
            </Link>
            <div className="flex shrink-0 items-center gap-1">
              <ActionMenuButton
                items={[
                  {
                    label: t("common.edit"),
                    icon: Pencil,
                    onClick: () => openEdit(setlist),
                  },
                  {
                    label: t("common.delete"),
                    icon: Trash2,
                    destructive: true,
                    onClick: () => setSetlistToDelete(setlist.id),
                  },
                ]}
              />
            </div>
          </li>
        ))}
      </ul>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="bg-background w-full max-w-md space-y-4 rounded-t-xl p-4 sm:rounded-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingSetlist
                  ? t("setlists.dialog.editTitle")
                  : t("setlists.dialog.addTitle")}
              </h2>
              <button
                onClick={() => setIsFormOpen(false)}
                aria-label={t("common.close", "Close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">
                  {t("setlists.dialog.titleLabel")}
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
                  {t("setlists.dialog.descriptionLabel")}
                </label>
                <input
                  className="border-input mt-1 h-9 w-full rounded-lg border px-3 text-sm"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsFormOpen(false)}
                className="h-9 rounded-lg border px-3 text-sm"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSubmit}
                disabled={!title.trim()}
                className="bg-primary text-primary-foreground h-9 rounded-lg px-3 text-sm disabled:opacity-50"
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {setlistToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background w-full max-w-sm space-y-4 rounded-xl p-4">
            <h2 className="text-lg font-semibold">
              {t("setlists.dialog.deleteConfirm")}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t(
                "setlists.dialog.deleteWarning",
                "This will remove the setlist and its song order. This cannot be undone.",
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSetlistToDelete(null)}
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
