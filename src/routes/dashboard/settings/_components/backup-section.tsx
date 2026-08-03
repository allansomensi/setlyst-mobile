import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import {
  Download,
  UploadCloud,
  Loader2,
  CheckCircle2,
  Music,
  Users,
  ListMusic,
} from "lucide-react";
import { backupApi, LocalApiError } from "@/lib/local-api";
import { useAuth } from "@/lib/auth-context";
import type { BackupFile, ImportBackupSummary } from "@/types/api";

export function BackupSection() {
  const { t } = useTranslation();
  const { session } = useAuth();

  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportBackupSummary | null>(
    null,
  );

  const handleExport = async () => {
    if (!session) return;
    setIsExporting(true);
    try {
      const backup = await backupApi.export(session.user_id);
      const defaultName = `setlyst-backup-${new Date().toISOString().split("T")[0]}.json`;

      const path = await save({
        defaultPath: defaultName,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (!path) return;

      const content = JSON.stringify(backup, null, 2);
      await writeTextFile(path, content);

      const check = await readTextFile(path);
      if (!check || check.length === 0) {
        throw new Error("Write produced an empty file");
      }

      toast.success(t("settings.backupExportSuccess", "Backup exported!"));
    } catch (err) {
      toast.error(
        err instanceof LocalApiError ? err.message : "Failed to export backup",
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    if (!session) return;

    setIsImporting(true);
    try {
      const selectedPath = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (!selectedPath) {
        setIsImporting(false);
        return;
      }

      const path = Array.isArray(selectedPath) ? selectedPath[0] : selectedPath;

      const content = await readTextFile(path);

      const backup = JSON.parse(content) as BackupFile;
      const result = await backupApi.import(session.user_id, backup);

      setImportResult(result);
      toast.success(t("settings.backupImportSuccess", "Backup imported!"));
    } catch (err) {
      toast.error(
        err instanceof LocalApiError
          ? err.message
          : t("settings.backupInvalidFile", "Invalid backup file."),
      );
    } finally {
      setIsImporting(false);
    }
  };

  const isBusy = isExporting || isImporting;

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {t(
          "settings.backupDescription",
          "Export your complete repertoire or restore it from a previous backup file (.json).",
        )}
      </p>

      {/* Export */}
      <div className="border-border bg-muted/30 flex items-center justify-between rounded-lg border p-3">
        <div className="min-w-0 pr-3">
          <h4 className="text-sm font-medium">
            {t("settings.backupExportActionTitle", "Export Data")}
          </h4>
          <p className="text-muted-foreground text-xs">
            {t(
              "settings.backupExportActionDesc",
              "Download a secure copy of your entire repertoire.",
            )}
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={isBusy}
          className="flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium disabled:opacity-60"
        >
          {isExporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {t("settings.backupExportBtn", "Export")}
        </button>
      </div>

      <button
        onClick={handleImport}
        disabled={isBusy}
        className="border-muted-foreground/25 hover:bg-accent/50 flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center disabled:opacity-60"
      >
        <div className="bg-background ring-border rounded-full p-2.5 shadow-sm ring-1">
          {isImporting ? (
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
          ) : (
            <UploadCloud className="text-muted-foreground h-5 w-5" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium">
            {t("settings.backupDropzoneTitle", "Tap to choose a backup file")}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {t("settings.backupDropzoneDesc", "JSON backup files only")}
          </p>
        </div>
      </button>

      {importResult && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-emerald-900 dark:border-emerald-500/10 dark:bg-emerald-500/5 dark:text-emerald-400">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            {t(
              "settings.backupImportSuccessTitle",
              "Backup imported successfully!",
            )}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="bg-background/60 dark:bg-background/40 flex flex-col items-center gap-1 rounded-md border border-emerald-500/20 p-2 dark:border-emerald-500/10">
              <Users className="text-primary h-4 w-4" />
              <span className="text-foreground text-sm font-bold">
                {importResult.artists_imported}
              </span>
              <span className="text-muted-foreground text-[10px]">
                {t("settings.backupArtists", "Artists")}
              </span>
            </div>
            <div className="bg-background/60 dark:bg-background/40 flex flex-col items-center gap-1 rounded-md border border-emerald-500/20 p-2 dark:border-emerald-500/10">
              <Music className="text-primary h-4 w-4" />
              <span className="text-foreground text-sm font-bold">
                {importResult.songs_imported}
              </span>
              <span className="text-muted-foreground text-[10px]">
                {t("settings.backupSongs", "Songs")}
              </span>
            </div>
            <div className="bg-background/60 dark:bg-background/40 flex flex-col items-center gap-1 rounded-md border border-emerald-500/20 p-2 dark:border-emerald-500/10">
              <ListMusic className="text-primary h-4 w-4" />
              <span className="text-foreground text-sm font-bold">
                {importResult.setlists_imported}
              </span>
              <span className="text-muted-foreground text-[10px]">
                {t("settings.backupSetlists", "Setlists")}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
