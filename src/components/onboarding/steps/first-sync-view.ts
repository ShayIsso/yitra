import type { ConnectedInstitution } from "../connected-institutions";
import type { SyncStreamState } from "@/components/sync-stream";

export type ConnectedLoad =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | { readonly status: "ready"; readonly connected: readonly ConnectedInstitution[] };

export type FirstSyncNotice =
  | { readonly kind: "refused"; readonly message: string }
  | { readonly kind: "connection-error" };

export type FirstSyncPhase =
  | "loading"
  /** The connected institutions could not be read. */
  | "unavailable"
  /** The institution step was skipped: there is nothing to sync. */
  | "no-credentials"
  /** Not started yet, or the last start was refused or broke off. */
  | "ready"
  | "running"
  | "finished";

export type FirstSyncView = {
  readonly phase: FirstSyncPhase;
  readonly notice: FirstSyncNotice | null;
  /** Some institution's run ended in an error — often its credentials, fixed from the institution step. */
  readonly failedInstitution: boolean;
  /** Some institution's run ended in an error or a missed OTP window. */
  readonly retryable: boolean;
};

export type FirstSyncPrimary = "wait" | "start" | "busy" | "finish";

export function deriveFirstSyncView(load: ConnectedLoad, stream: SyncStreamState): FirstSyncView {
  const notice: FirstSyncNotice | null =
    stream.refusal !== null
      ? { kind: "refused", message: stream.refusal }
      : stream.connectionError
        ? { kind: "connection-error" }
        : null;

  const outcomes =
    load.status === "ready"
      ? load.connected.map((institution) => stream.bankStates[institution.bankType]?.status)
      : [];
  const failedInstitution = outcomes.includes("error");
  const retryable = failedInstitution || outcomes.includes("otp_timeout");

  // A start the server has not answered yet counts as running: a second click
  // must not send a second request, and leaving must not abort it unasked.
  const phase: FirstSyncPhase =
    stream.starting || stream.syncing
      ? "running"
      : load.status === "loading"
        ? "loading"
        : load.status === "failed"
          ? "unavailable"
          : load.connected.length === 0
            ? "no-credentials"
            : stream.summary !== null
              ? "finished"
              : "ready";

  return { phase, notice, failedInstitution, retryable };
}

/**
 * Where the footer leads. Skipping is offered only where it differs from the
 * primary button: once there is nothing to sync, or the sync has run, the
 * primary already completes onboarding. While a run is live nothing leads
 * away, since leaving the step aborts the run.
 */
export function firstSyncFooter(view: FirstSyncView): {
  readonly primary: FirstSyncPrimary;
  readonly skip: boolean;
} {
  switch (view.phase) {
    case "loading":
      return { primary: "wait", skip: true };
    case "ready":
      return { primary: "start", skip: true };
    case "running":
      return { primary: "busy", skip: false };
    case "unavailable":
    case "no-credentials":
    case "finished":
      return { primary: "finish", skip: false };
  }
}
