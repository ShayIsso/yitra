import { useEffect, useReducer, useRef } from "react";

/**
 * One month-scoped read on the home screen (the outlook, the sections below
 * it). Only the latest request may land: an answer to an earlier one (a month
 * the owner already tapped past) is dropped, so the hero and the sections can
 * never settle on different months. A refetch of the same month keeps its
 * data on screen until the new answer arrives; a different month's data stays
 * available but is marked not current.
 */
export type MonthLoadResult<T> = { ok: true; data: T } | { ok: false };

export type MonthLoad<T> = {
  /** The latest request; a settle carrying any other is stale. */
  seq: number;
  key: string | null;
  settled: { seq: number; key: string; result: MonthLoadResult<T> } | null;
};

export type MonthLoadAction<T> =
  | { type: "request"; seq: number; key: string }
  | { type: "settle"; seq: number; key: string; result: MonthLoadResult<T> };

export const INITIAL_MONTH_LOAD: MonthLoad<never> = { seq: 0, key: null, settled: null };

export function monthLoadReducer<T>(state: MonthLoad<T>, action: MonthLoadAction<T>): MonthLoad<T> {
  switch (action.type) {
    case "request":
      return { ...state, seq: action.seq, key: action.key };
    case "settle":
      if (action.seq !== state.seq) return state;
      return { ...state, settled: { seq: action.seq, key: action.key, result: action.result } };
  }
}

export type MonthLoadView<T> = {
  /** The last data that arrived, for whichever month; null before any or after a failure. */
  data: T | null;
  /** The last answer is for the month now requested. */
  current: boolean;
  /** The last answer was a failure. */
  failed: boolean;
  /** A request has not been answered yet. */
  pending: boolean;
};

export function monthLoadView<T>(state: MonthLoad<T>): MonthLoadView<T> {
  const { settled } = state;
  return {
    data: settled?.result.ok ? settled.result.data : null,
    current: settled !== null && settled.key === state.key,
    failed: settled !== null && !settled.result.ok,
    pending: settled?.seq !== state.seq,
  };
}

/**
 * Loads `key` whenever it or `version` changes, aborting the request it
 * supersedes. `load` may change identity every render; the latest is used.
 */
export function useMonthLoad<T>(
  key: string,
  version: number,
  load: (signal: AbortSignal) => Promise<T>,
): MonthLoadView<T> {
  const [state, dispatch] = useReducer(monthLoadReducer<T>, INITIAL_MONTH_LOAD as MonthLoad<T>);
  const seqRef = useRef(0);
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    const seq = ++seqRef.current;
    const controller = new AbortController();
    dispatch({ type: "request", seq, key });
    loadRef.current(controller.signal).then(
      (data) => dispatch({ type: "settle", seq, key, result: { ok: true, data } }),
      () => {
        if (!controller.signal.aborted) {
          dispatch({ type: "settle", seq, key, result: { ok: false } });
        }
      },
    );
    return () => controller.abort();
  }, [key, version]);

  return monthLoadView(state);
}
