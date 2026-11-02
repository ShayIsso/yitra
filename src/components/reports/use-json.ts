"use client";

import * as React from "react";

export type JsonState<T> =
  | { status: "loading" }
  | { status: "error" }
  /** `stale`: a newer request is in flight; `data` is the previous answer, held to avoid a skeleton flash. */
  | { status: "ready"; data: T; stale: boolean };

type Settled<T> = { key: string; ok: true; data: T } | { key: string; ok: false };

/**
 * GETs `url` as JSON (null = don't fetch yet). A non-2xx answer or a network
 * failure is an error the caller renders inline with `retry`. While a new URL
 * loads, the last good answer stays on screen marked stale rather than being
 * replaced by a skeleton (the dataviz "no skeleton flash on refetch" rule).
 */
export function useJson<T>(url: string | null): { state: JsonState<T>; retry: () => void } {
  const [attempt, setAttempt] = React.useState(0);
  const key = url === null ? null : `${attempt}:${url}`;
  const [settled, setSettled] = React.useState<Settled<T> | null>(null);
  const [lastGood, setLastGood] = React.useState<T | null>(null);

  React.useEffect(() => {
    if (url === null || key === null) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<T>;
      })
      .then((data) => {
        setSettled({ key, ok: true, data });
        setLastGood(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSettled({ key, ok: false });
      });
    return () => controller.abort();
  }, [url, key]);

  const retry = React.useCallback(() => setAttempt((n) => n + 1), []);

  let state: JsonState<T>;
  if (settled && settled.key === key) {
    state = settled.ok
      ? { status: "ready", data: settled.data, stale: false }
      : { status: "error" };
  } else if (lastGood !== null && settled?.ok) {
    state = { status: "ready", data: lastGood, stale: true };
  } else {
    state = { status: "loading" };
  }
  return { state, retry };
}
