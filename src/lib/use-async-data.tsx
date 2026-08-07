import { useCallback, useEffect, useState } from "react";
import { LocalApiError } from "./local-api";

type Status = "loading" | "ready" | "error";

export function useAsyncData<T>(
  fetcher: (() => Promise<T>) | null,
  deps: React.DependencyList,
) {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!fetcher) return;
    setStatus((s) => (s === "ready" ? "ready" : "loading"));
    try {
      const result = await fetcher();
      setData(result);
      setStatus("ready");
      setError(null);
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof LocalApiError
          ? err.message
          : "Something went wrong loading your data.",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, status, error, reload, setData };
}
