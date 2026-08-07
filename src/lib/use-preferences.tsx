import { useCallback, useEffect, useState } from "react";
import { preferencesApi } from "./local-api";
import type { UserPreferences, UpdatePreferencesPayload } from "@/types/api";

export function usePreferences(userId: string | undefined) {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }
    try {
      const prefs = await preferencesApi.get(userId);
      setPreferences(prefs);
      setError(null);
    } catch (err) {
      console.error("[usePreferences] failed to load preferences:", err);
      setError("Failed to load your preferences.");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const update = useCallback(
    async (payload: UpdatePreferencesPayload) => {
      if (!userId) return;
      setPreferences((prev) => (prev ? { ...prev, ...payload } : prev));
      const updated = await preferencesApi.update(userId, payload);
      setPreferences(updated);
      return updated;
    },
    [userId],
  );

  return { preferences, isLoading, error, reload, update };
}
