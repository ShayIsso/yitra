import { useCallback, useEffect, useReducer, useRef } from "react";
import { takeFrames } from "@/lib/sse-frames";

/**
 * The one client-side consumer of `GET /api/sync` and the OTP bridge, shared
 * by the Sync page and the wizard's first-sync step so neither keeps its own
 * copy of the framing, the per-bank state machine or the OTP countdown. The
 * protocol itself belongs to the route and ADR-0003; this only reads it.
 */

export type BankSyncState = {
  status:
    | "idle"
    | "initializing"
    | "logging_in"
    | "login_success"
    | "scraping"
    | "importing"
    | "complete"
    | "error"
    | "otp_required"
    | "otp_timeout";
  error?: string;
  hasScreenshot?: boolean;
  screenshotFilename?: string;
  transactionCount?: number;
};

export type SyncSummary = {
  total: number;
  byBank: Record<string, number>;
};

/** What the route sends: `otpHandler` and `_credentialId` are stripped server-side. */
export type ClientSyncEvent =
  | { type: "progress"; bank: string; status: BankSyncState["status"] }
  | { type: "otp_required"; bank: string }
  | { type: "otp_timeout"; bank: string }
  | { type: "bank_complete"; bank: string }
  | {
      type: "bank_error";
      bank: string;
      error: string;
      hasScreenshot: boolean;
      screenshotFilename?: string;
    }
  | { type: "reconciliation_summary"; autoApplied: number; queued: number }
  | { type: "ai_summary"; applied: number; queued: number; skipped: number }
  | { type: "sync_complete"; summary: SyncSummary };

/** The OTP bridge's server-side timeout (`src/lib/scraper/otp.ts`), mirrored for the countdown only. */
export const OTP_WINDOW_SECONDS = 180;

export type OtpCountdown = { readonly secondsLeft: number; readonly running: boolean };

export type SyncStreamState = {
  readonly syncing: boolean;
  readonly bankStates: Record<string, BankSyncState>;
  readonly summary: SyncSummary | null;
  readonly reconciliation: { autoApplied: number; queued: number } | null;
  readonly aiSummary: { applied: number; queued: number; skipped: number } | null;
  readonly connectionError: boolean;
  /**
   * A start refused because a sync or categorization backfill already holds the
   * claim (#246). Distinct from `connectionError` so it does not read as a failure.
   */
  readonly refusal: string | null;
  readonly otp: Record<string, OtpCountdown>;
  readonly otpDrafts: Record<string, string>;
};

export type SyncStreamAction =
  | { type: "start_requested" }
  | { type: "accepted" }
  | { type: "refused"; message: string }
  /** The start itself failed before any stream opened. */
  | { type: "start_failed" }
  /** An accepted stream broke or closed without `sync_complete`. */
  | { type: "stream_failed" }
  | { type: "event"; event: ClientSyncEvent }
  | { type: "otp_tick" }
  | { type: "otp_draft"; bank: string; code: string }
  | { type: "otp_submitted"; bank: string }
  | { type: "reconciliation_dismissed" };

export function initialSyncStreamState(): SyncStreamState {
  return {
    syncing: false,
    bankStates: {},
    summary: null,
    reconciliation: null,
    aiSummary: null,
    connectionError: false,
    refusal: null,
    otp: {},
    otpDrafts: {},
  };
}

const REFUSED_FALLBACK = "סנכרון או סיווג עסקאות כבר פועלים. נסה שוב בסיומם.";

/** The route's own 409 message, so the wording tracks `route.ts`; the fallback covers an unreadable body. */
export function refusalMessage(body: unknown): string {
  return body != null &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string"
    ? body.error
    : REFUSED_FALLBACK;
}

/**
 * True once `sync_complete` has been seen — the only event that means the run
 * actually finished. A clean EOF without it is a failure (e.g. an unwrapped
 * throw in the post-import pipeline closes the server's stream early).
 */
export function hasSyncComplete(events: ClientSyncEvent[]): boolean {
  return events.some((event) => event.type === "sync_complete");
}

function withBank(
  state: SyncStreamState,
  bank: string,
  next: (prev: BankSyncState | undefined) => BankSyncState,
): SyncStreamState {
  return { ...state, bankStates: { ...state.bankStates, [bank]: next(state.bankStates[bank]) } };
}

function stopCountdown(state: SyncStreamState, bank: string): SyncStreamState {
  const countdown = state.otp[bank];
  if (!countdown) return state;
  return { ...state, otp: { ...state.otp, [bank]: { ...countdown, running: false } } };
}

function applyEvent(state: SyncStreamState, event: ClientSyncEvent): SyncStreamState {
  switch (event.type) {
    case "progress":
      return withBank(state, event.bank, (prev) => ({ ...prev, status: event.status }));
    case "otp_required":
      return {
        ...withBank(state, event.bank, (prev) => ({ ...prev, status: "otp_required" })),
        otp: { ...state.otp, [event.bank]: { secondsLeft: OTP_WINDOW_SECONDS, running: true } },
      };
    case "otp_timeout":
      return withBank(stopCountdown(state, event.bank), event.bank, (prev) => ({
        ...prev,
        status: "otp_timeout",
      }));
    case "bank_complete":
      return withBank(state, event.bank, (prev) => ({ ...prev, status: "complete" }));
    case "bank_error":
      return withBank(state, event.bank, () => ({
        status: "error",
        error: event.error,
        hasScreenshot: event.hasScreenshot,
        screenshotFilename: event.screenshotFilename,
      }));
    case "reconciliation_summary":
      return event.autoApplied > 0 || event.queued > 0
        ? { ...state, reconciliation: { autoApplied: event.autoApplied, queued: event.queued } }
        : state;
    case "ai_summary":
      return event.applied > 0 || event.queued > 0 || event.skipped > 0
        ? {
            ...state,
            aiSummary: { applied: event.applied, queued: event.queued, skipped: event.skipped },
          }
        : state;
    case "sync_complete": {
      const bankStates = { ...state.bankStates };
      for (const [bank, count] of Object.entries(event.summary.byBank)) {
        if (bankStates[bank]) bankStates[bank] = { ...bankStates[bank], transactionCount: count };
      }
      return { ...state, bankStates, summary: event.summary, syncing: false };
    }
  }
}

function tick(otp: Record<string, OtpCountdown>): Record<string, OtpCountdown> {
  const next: Record<string, OtpCountdown> = {};
  for (const [bank, countdown] of Object.entries(otp)) {
    if (!countdown.running) {
      next[bank] = countdown;
      continue;
    }
    const secondsLeft = countdown.secondsLeft - 1;
    next[bank] =
      secondsLeft <= 0 ? { secondsLeft: 0, running: false } : { secondsLeft, running: true };
  }
  return next;
}

export function syncStreamReducer(
  state: SyncStreamState,
  action: SyncStreamAction,
): SyncStreamState {
  switch (action.type) {
    case "start_requested":
      return { ...state, connectionError: false, refusal: null };
    case "accepted":
      // Only an accepted start may clear the previous run's display: a refused
      // one must not wipe a still-active (or just-completed) run's data.
      return { ...initialSyncStreamState(), syncing: true };
    case "refused":
      // `syncing` is left as it is: a run of ours that is genuinely still live
      // must not be hidden by a refused second start.
      return { ...state, refusal: action.message };
    case "start_failed":
      return { ...state, connectionError: true };
    case "stream_failed":
      return { ...state, syncing: false, connectionError: true };
    case "event":
      return applyEvent(state, action.event);
    case "otp_tick":
      return { ...state, otp: tick(state.otp) };
    case "otp_draft":
      return { ...state, otpDrafts: { ...state.otpDrafts, [action.bank]: action.code } };
    case "otp_submitted":
      return {
        ...stopCountdown(state, action.bank),
        otpDrafts: { ...state.otpDrafts, [action.bank]: "" },
      };
    case "reconciliation_dismissed":
      return { ...state, reconciliation: null };
  }
}

export type SyncStream = {
  readonly state: SyncStreamState;
  readonly start: () => Promise<void>;
  readonly setOtpDraft: (bank: string, code: string) => void;
  readonly submitOtp: (bank: string) => Promise<void>;
  readonly dismissReconciliation: () => void;
};

export type SyncStreamOptions = {
  /** Runs after `sync_complete` has been applied. */
  readonly onComplete?: () => void;
};

/**
 * Unmounting aborts the request, and the route's `cancel()` then stops the
 * scrape and releases the sync claim — a consumer that must not lose a run on
 * navigation has to keep itself mounted (or warn) while `syncing`.
 */
export function useSyncStream({ onComplete }: SyncStreamOptions = {}): SyncStream {
  const [state, dispatch] = useReducer(syncStreamReducer, undefined, initialSyncStreamState);
  const controllerRef = useRef<AbortController | null>(null);
  const onCompleteRef = useRef(onComplete);
  const draftsRef = useRef(state.otpDrafts);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    draftsRef.current = state.otpDrafts;
  });

  useEffect(() => () => controllerRef.current?.abort(), []);

  const countdownRunning = Object.values(state.otp).some((countdown) => countdown.running);
  useEffect(() => {
    if (!countdownRunning) return;
    const interval = setInterval(() => dispatch({ type: "otp_tick" }), 1000);
    return () => clearInterval(interval);
  }, [countdownRunning]);

  const start = useCallback(async () => {
    // No pre-emptive abort of a prior controller: a retry offered beside one
    // failed institution routinely fires while others are still mid-run, and
    // refusing that second start (409) is exactly what #246 wants — killing
    // the still-useful stream would make the refusal happen *because of* it.
    dispatch({ type: "start_requested" });
    const controller = new AbortController();
    controllerRef.current = controller;
    let sawSyncComplete = false;

    try {
      // Plain fetch instead of EventSource — EventSource cannot read the
      // response status, and the 409 must be seen before any stream is
      // treated as open (#246).
      const res = await fetch("/api/sync", {
        signal: controller.signal,
        headers: { Accept: "text/event-stream" },
      });

      if (res.status === 409) {
        dispatch({ type: "refused", message: refusalMessage(await res.json().catch(() => null)) });
        return;
      }
      if (!res.ok || !res.body) {
        dispatch({ type: "start_failed" });
        return;
      }

      dispatch({ type: "accepted" });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        // {stream: true} keeps a multi-byte UTF-8 char (Hebrew error text)
        // split across a chunk boundary from decoding as garbage.
        buffer += decoder.decode(value, { stream: true });
        const { frames, rest } = takeFrames(buffer);
        buffer = rest;
        for (const frame of frames) {
          if (!frame.startsWith("data: ")) continue;
          const event = JSON.parse(frame.slice(6)) as ClientSyncEvent;
          dispatch({ type: "event", event });
          if (event.type === "sync_complete") {
            sawSyncComplete = true;
            onCompleteRef.current?.();
          }
        }
      }

      if (!sawSyncComplete) dispatch({ type: "stream_failed" });
    } catch {
      const wasIntentional = controller.signal.aborted;
      // Tears the connection down even when *we* threw (a malformed frame), so
      // the server stops consuming the generator and releases the claim.
      controller.abort();
      if (wasIntentional) return;
      dispatch({ type: "stream_failed" });
    }
  }, []);

  const setOtpDraft = useCallback((bank: string, code: string) => {
    dispatch({ type: "otp_draft", bank, code });
  }, []);

  const submitOtp = useCallback(async (bank: string) => {
    const code = draftsRef.current[bank];
    if (!code?.trim()) return;
    dispatch({ type: "otp_submitted", bank });
    await fetch("/api/sync/otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
  }, []);

  const dismissReconciliation = useCallback(
    () => dispatch({ type: "reconciliation_dismissed" }),
    [],
  );

  return { state, start, setOtpDraft, submitOtp, dismissReconciliation };
}
