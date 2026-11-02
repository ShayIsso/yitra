import type { BankSyncState, OtpCountdown } from "@/components/sync-stream";
import type { SyncRunSummary } from "@/lib/sync/runs";

/**
 * What one institution's sync status says, decided once for every screen that
 * shows it (the Sync page and the setup wizard's first sync). Every view
 * carries words and an icon, so no outcome is told by colour alone; a failure
 * or a code request is an `attention` tone, which renders coral (ADR-0015),
 * never the red of negative money.
 */
export type BankStatusTone = "waiting" | "running" | "done" | "attention" | "quiet";

export type BankStatusIcon = "clock" | "sync" | "check" | "warning" | "key" | "pause" | "dot";

export type BankStatusView = {
  readonly tone: BankStatusTone;
  readonly icon: BankStatusIcon;
  readonly label: string;
  /** The sync's own failure text, already redacted server-side; shown under the status. */
  readonly detail: string | null;
  /** Stage position in (0, 1) while the run is on this institution, else null. */
  readonly progress: number | null;
  /** Announce to assistive tech: only states that ask something of the owner. */
  readonly alert: boolean;
};

const STAGE_LABEL: Partial<Record<BankSyncState["status"], string>> = {
  initializing: "מאתחל...",
  logging_in: "מתחבר...",
  login_success: "התחברות הצליחה",
  scraping: "מוריד תנועות...",
  importing: "מייבא לבסיס נתונים...",
};

const STAGE_PROGRESS: Partial<Record<BankSyncState["status"], number>> = {
  initializing: 0.1,
  logging_in: 0.25,
  otp_required: 0.25,
  login_success: 0.45,
  scraping: 0.65,
  importing: 0.85,
};

/**
 * How far one institution's run has come, for a determinate bar. The stream
 * reports stages, not percentages, so these are stage positions rather than a
 * measure of time; null before the run reaches the institution and once it has
 * ended, where the status states the outcome instead. An OTP wait holds at the
 * login stage it interrupts.
 */
export function syncStageProgress(status: BankSyncState["status"] | undefined): number | null {
  return (status && STAGE_PROGRESS[status]) ?? null;
}

const MISSED_CODE = "קוד האימות לא הוזן בזמן";

function view(
  tone: BankStatusTone,
  icon: BankStatusIcon,
  label: string,
  extra: Partial<Pick<BankStatusView, "detail" | "progress" | "alert">> = {},
): BankStatusView {
  return { tone, icon, label, detail: null, progress: null, alert: false, ...extra };
}

/**
 * Asked for a one-time code and none has been sent yet. Sending one stops the
 * countdown early (`otp_submitted`), so a stopped clock with time left means
 * the wait is on the bank rather than on the owner.
 */
export function awaitsCode(state: BankSyncState | undefined, otp?: OtpCountdown): boolean {
  if (state?.status !== "otp_required") return false;
  return !(otp && !otp.running && otp.secondsLeft > 0);
}

/**
 * The status this tab has heard over the live stream. `running` is whether a
 * run is in flight, so an institution it has not reached yet reads as queued.
 * `otp` is that institution's code countdown.
 */
export function liveBankStatus(
  state: BankSyncState | undefined,
  { running, otp }: { running: boolean; otp?: OtpCountdown },
): BankStatusView {
  const status = state?.status ?? "idle";
  const progress = syncStageProgress(status);
  switch (status) {
    case "idle":
      return view("waiting", "clock", running ? "ממתין לתורו" : "ממתין");
    case "complete":
      return view(
        "done",
        "check",
        state?.transactionCount !== undefined
          ? `הושלם · ${state.transactionCount} תנועות`
          : "הושלם",
      );
    case "otp_required":
      return awaitsCode(state, otp)
        ? view("attention", "key", "נדרש קוד אימות", { progress, alert: true })
        : view("running", "sync", "הקוד נשלח, ממתין לבנק...", { progress });
    case "otp_timeout":
      return view("attention", "warning", MISSED_CODE, { alert: true });
    case "error":
      return view("attention", "warning", "הסנכרון נכשל", {
        detail: state?.error ?? null,
        alert: true,
      });
    case "interrupted":
      return view("quiet", "pause", "הופסק");
    default:
      return view("running", "sync", STAGE_LABEL[status] ?? "", { progress });
  }
}

/**
 * The institution's last recorded run (`sync_runs`), for an institution this
 * tab has not heard from. The run's age is not part of the label: it can only
 * be computed once the client has read its clock (bug #193), and a label that
 * grew after hydration would shift the row.
 */
export function persistedBankStatus(run: SyncRunSummary | undefined): BankStatusView {
  if (!run) return view("quiet", "dot", "עדיין לא סונכרן");
  switch (run.status) {
    case "success":
      return view("done", "check", `סונכרן · ${run.transactionsImported} תנועות`);
    case "otp_skipped":
      return view("attention", "warning", MISSED_CODE);
    case "error":
      return view("attention", "warning", "הסנכרון האחרון נכשל", { detail: run.errorMessage });
  }
}
