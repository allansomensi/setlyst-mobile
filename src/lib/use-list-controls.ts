import { useState, useMemo } from "react";

export function useListControls<T>(
  data: T[],
  searchableKeys: readonly (keyof T)[],
  pageSize = 15,
) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const term = search.toLowerCase();
    return data.filter((item) =>
      searchableKeys.some((key) => {
        const val = item[key];
        return typeof val === "string" && val.toLowerCase().includes(term);
      }),
    );
  }, [data, search, searchableKeys]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page_ = Math.min(page, totalPages);

  const paged = useMemo(
    () => filtered.slice((page_ - 1) * pageSize, page_ * pageSize),
    [filtered, page_, pageSize],
  );

  return {
    search,
    setSearch: (v: string) => {
      setSearch(v);
      setPage(1);
    },
    page: page_,
    setPage,
    totalPages,
    totalItems: filtered.length,
    items: paged,
  };
}
