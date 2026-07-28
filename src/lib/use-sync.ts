import { useState, useCallback } from "react";
import { syncApi, LocalApiError } from "./local-api";
import { API_BASE_URL } from "./auth-context";
import type { PreferencesConflict, SyncReport } from "@/types/api";

type SyncStatus = "idle" | "syncing" | "success" | "error";

export function useSync() {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [report, setReport] = useState<SyncReport | null>(null);
  const [conflict, setConflict] = useState<PreferencesConflict | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSync = useCallback(async () => {
    setStatus("syncing");
    setError(null);
    try {
      const result = await syncApi.run(API_BASE_URL);
      if (result.preferences_conflict) setConflict(result.preferences_conflict);
      setReport(result);
      setStatus(result.errors.length > 0 ? "error" : "success");
    } catch (err) {
      const message =
        err instanceof LocalApiError
          ? err.code === "NO_OFFLINE_SESSION"
            ? "You need to log in online at least once before syncing."
            : err.code === "NETWORK_ERROR"
              ? "No internet connection. Your local changes are safe and will sync next time."
              : err.message
          : "Unexpected error during sync.";
      setError(message);
      setStatus("error");
    }
  }, []);

  return {
    status,
    report,
    error,
    runSync,
    conflict,
    clearConflict: () => setConflict(null),
  };
}
