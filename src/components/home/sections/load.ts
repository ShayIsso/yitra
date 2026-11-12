import * as React from "react";
import { israelCalendarDay } from "@/lib/calendar";
import { useMonthLoad } from "../month-load";

/** Data read for every month alike (balances, queues, the latest rows): a month change keeps it. */
export const ANY_MONTH = "any";

export type SectionLoad<T> = {
  /** The answer for the key now requested, kept on screen through a re-read. */
  data: T | null;
  /** The latest answer for any key: a skeleton keeps its shape across a month change. */
  last: T | null;
  /** The home calendar day when `data` arrived. */
  today: string | null;
  /** There is nothing to show and the latest read failed. */
  failed: boolean;
  /** A read has not been answered yet. */
  pending: boolean;
  retry: () => void;
};

/**
 * One home section's read, through `useMonthLoad` so only the latest answer
 * lands. `key` is the month key for month-scoped data, or {@link ANY_MONTH}.
 * Each section reads and retries on its own, so one failure blanks only that
 * section.
 */
export function useSectionLoad<T>(url: string, key: string, refreshKey: string): SectionLoad<T> {
  const [attempt, setAttempt] = React.useState(0);
  const load = useMonthLoad<{ body: T; today: string }>(key, `${refreshKey}:${attempt}`, (signal) =>
    // A microtask later: child effects run before their parent's, and the
    // hero's outlook request (first on screen) must not queue behind the
    // sections on the browser's per-host connection limit.
    Promise.resolve().then(async () => {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as T;
      return { body, today: israelCalendarDay(new Date()) };
    }),
  );
  const shown = load.current ? load.data : null;
  const retry = React.useCallback(() => setAttempt((a) => a + 1), []);
  return {
    data: shown?.body ?? null,
    last: load.data?.body ?? null,
    today: shown?.today ?? null,
    failed: shown === null && load.failed,
    pending: load.pending,
    retry,
  };
}
