"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { buildFilterSearchParams } from "@/lib/transactions/filter-params";
import {
  parseTransactionsView,
  transactionsViewQuery,
  type TransactionsView,
} from "@/lib/transactions/view-params";
import type { Transaction, TransactionsResponse } from "./types";

type Loaded =
  | { key: string; status: "ok"; rows: Transaction[]; total: number }
  | { key: string; status: "error" };

/**
 * The page's view lives in the URL (`view-params.ts`): this hook reads it,
 * writes changes back with the History API (Next.js syncs `useSearchParams`
 * with it, without a server round trip), and fetches the listing for it.
 */
export function useTransactionsView() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const query = searchParams.toString();
  const view = React.useMemo(() => parseTransactionsView(new URLSearchParams(query)), [query]);

  const navigate = React.useCallback(
    (patch: Partial<TransactionsView>, { replace = false }: { replace?: boolean } = {}) => {
      // Any filter change starts over at the first page.
      const next = { ...view, page: 1, ...patch };
      const qs = transactionsViewQuery(next).toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (replace) window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
    },
    [view, pathname],
  );

  const apiQuery = React.useMemo(() => {
    const params = buildFilterSearchParams(view);
    params.set("page", String(view.page));
    params.set("pageSize", String(view.pageSize));
    return params.toString();
  }, [view]);

  const [attempt, setAttempt] = React.useState(0);
  const key = `${apiQuery}#${attempt}`;
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/transactions?${apiQuery}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<TransactionsResponse>;
      })
      .then((res) => setLoaded({ key, status: "ok", rows: res.data, total: res.total }))
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ key, status: "error" });
      });
    return () => controller.abort();
  }, [apiQuery, key]);

  const reload = React.useCallback(() => setAttempt((a) => a + 1), []);

  /** Optimistic edit of the rows on screen after a successful mutation. */
  const updateRows = React.useCallback((fn: (rows: Transaction[]) => Transaction[]) => {
    setLoaded((prev) => (prev?.status === "ok" ? { ...prev, rows: fn(prev.rows) } : prev));
  }, []);

  const current = loaded?.key === key ? loaded : null;
  const lastOk = loaded?.status === "ok" ? loaded : null;

  return {
    view,
    navigate,
    /** The listing for this view is still in flight. */
    loading: current === null,
    failed: current?.status === "error",
    /** The latest rows, possibly a previous view's while the next one loads. */
    rows: lastOk?.rows ?? null,
    total: lastOk?.total ?? 0,
    /** Changes whenever the filtered, paged view does (not on a reload). */
    viewKey: apiQuery,
    reload,
    updateRows,
  };
}
