import { useEffect, useReducer, useRef } from "react";

/**
 * One month-scoped read on the home screen (the outlook, the sections below
 * it). Only the latest request may land: an answer to an earlier one (a month
 * the owner already tapped past) is dropped, so the hero and the sections can
 * never settle on different months. The last data that arrived stays
 * available: a refetch of the same month keeps it on screen until the new
 * answer lands, even if that answer is a failure; another month's data is
 * marked not current.
 */
type MonthLoadResult<T> = { ok: true; data: T } | { ok: false };

export type MonthLoad<T> = {
  /** The latest request; a settle carrying any other is stale. */
  seq: number;
  key: string | null;
  settledSeq: number;
  /** The last data that arrived, with the month it belongs to. */
  last: { key: string; data: T } | null;
  /** The month whose latest answer was a failure. */
  failedKey: string | null;
};

export type MonthLoadAction<T> =
  | { type: "request"; seq: number; key: string }
  | { type: "settle"; seq: number; key: string; result: MonthLoadResult<T> };

export const INITIAL_MONTH_LOAD: MonthLoad<never> = {
  seq: 0,
  key: null,
  settledSeq: 0,
  last: null,
  failedKey: null,
};

export function monthLoadReducer<T>(state: MonthLoad<T>, action: MonthLoadAction<T>): MonthLoad<T> {
  switch (action.type) {
    case "request":
      // A retry of the failed month keeps its failure on screen (pending);
      // moving to any other month forgets it, so coming back loads afresh.
      return {
        ...state,
        seq: action.seq,
        key: action.key,
        failedKey: action.key === state.key ? state.failedKey : null,
      };
    case "settle":
      if (action.seq !== state.seq) return state;
      return action.result.ok
        ? {
            ...state,
            settledSeq: action.seq,
            last: { key: action.key, data: action.result.data },
            failedKey: null,
          }
        : { ...state, settledSeq: action.seq, failedKey: action.key };
  }
}

export type MonthLoadView<T> = {
  /** The last data that arrived, for whichever month; null before any. */
  data: T | null;
  /** `data` belongs to the month now requested. */
  current: boolean;
  /** The latest answer for the month now requested was a failure. */
  failed: boolean;
  /** A request has not been answered yet. */
  pending: boolean;
};

export function monthLoadView<T>(state: MonthLoad<T>): MonthLoadView<T> {
  return {
    data: state.last?.data ?? null,
    current: state.last !== null && state.last.key === state.key,
    failed: state.failedKey !== null && state.failedKey === state.key,
    pending: state.settledSeq !== state.seq,
  };
}

/**
 * Loads `key` whenever it or `revision` changes, aborting the request it
 * supersedes. `load` may change identity every render; the latest is used.
 */
export function useMonthLoad<T>(
  key: string,
  revision: string | number,
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
  }, [key, revision]);

  return monthLoadView(state);
}
