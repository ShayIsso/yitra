"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowsClockwiseIcon,
  BankIcon,
  CheckCircleIcon,
  ClockIcon,
  InfoIcon,
  PauseIcon,
  PlusIcon,
  WarningCircleIcon,
} from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { aiSummaryLines } from "@/components/ai-summary-lines";
import { InstitutionTrustBadge, unverifiedFailureNote } from "@/components/institution-trust";
import { observedFromResponse } from "@/components/institution-picker";
import { OtpEntry, STATUS_TEXT } from "@/components/sync-bank-status";
import { useSyncStream, type BankSyncState, type SyncStreamState } from "@/components/sync-stream";
import { bankTrustOf } from "@/lib/bank-registry";
import { fetchConnectedInstitutions, type ConnectedInstitution } from "../connected-institutions";
import { InstitutionIdentity } from "../institution-identity";
import { StepFooter, type StepFooterPrimary } from "../step-footer";
import type { SetupStepProps, StepMeta, StepNavigation } from "../step-navigation";
import {
  deriveFirstSyncView,
  firstSyncFooter,
  syncStageProgress,
  type ConnectedLoad,
  type FirstSyncView,
} from "./first-sync-view";

/** Slot owned by #262: the real first sync on the existing SSE stream (epic #248 §10); the last step, so `navigation.advance` completes onboarding. Contract: `../step-navigation.ts`. */
export const firstSyncStepMeta: StepMeta = {
  label: "סנכרון",
  title: "סנכרון ראשון",
  description: "נמשוך את התנועות מהחשבון שחיברתם ונציג את ההתקדמות בזמן אמת.",
};

/**
 * `navigation.back` leads to the provider step; a credential to fix lives one
 * further back, so this links there by address. Each step is its own URL.
 */
const INSTITUTION_STEP_HREF = "/setup?step=institution";

const LEAVE_WARNING = "הסנכרון עדיין פועל, ויציאה מהדף תעצור אותו. לצאת בכל זאת?";

const NOTHING_OBSERVED: ReadonlySet<string> = new Set();

/**
 * The install's own sync evidence, so a resumed wizard does not caveat an
 * institution that already synced here (ADR-0013 §3). Until it answers, or if
 * it fails, every experimental institution keeps its caveat.
 */
function useObservedInstitutions(): {
  observed: ReadonlySet<string>;
  refresh: () => void;
} {
  const [observed, setObserved] = useState<ReadonlySet<string>>(NOTHING_OBSERVED);
  const refresh = useCallback(() => {
    fetch("/api/sync-runs/evidence")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => setObserved(observedFromResponse(body)))
      .catch(() => undefined);
  }, []);
  useEffect(refresh, [refresh]);
  return { observed, refresh };
}

/**
 * Leaving the step unmounts the stream, and the route then aborts the scrape
 * and releases the sync claim — so while a run is live, leaving is confirmed
 * rather than silent. The footer is already disabled; this covers the frame's
 * "continue later" link and a reload or tab close. The browser's own back
 * button is not covered: the App Router offers no cancellable navigation event.
 */
function useLeaveGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older Safari prompts only when returnValue is set.
      e.returnValue = "";
    };
    // Capture phase on the document runs before React's root listener, so a
    // declined confirm stops a Next.js <Link> before it routes.
    const onClick = (e: MouseEvent) => {
      const anchor = e.target instanceof Element ? e.target.closest("a[href]") : null;
      const opensElsewhere =
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        anchor?.getAttribute("target") === "_blank";
      if (!anchor || opensElsewhere || window.confirm(LEAVE_WARNING)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [active]);
}

/**
 * The step *is* the credential check: the scraper library offers no login
 * probe, so the first sync verifies the credentials (#262). Categorization runs
 * inside the sync's own post-import pipeline when a provider was configured.
 */
export function FirstSyncStep({ navigation }: SetupStepProps) {
  const [load, setLoad] = useState<ConnectedLoad>({ status: "loading" });
  const evidence = useObservedInstitutions();
  const sync = useSyncStream({ onComplete: evidence.refresh });

  useEffect(() => {
    let active = true;
    fetchConnectedInstitutions().then((connected) => {
      if (active) setLoad(connected ? { status: "ready", connected } : { status: "failed" });
    });
    return () => {
      active = false;
    };
  }, []);

  const view = deriveFirstSyncView(load, sync.state);
  useLeaveGuard(view.phase === "running");

  return (
    <FirstSyncBody
      navigation={navigation}
      load={load}
      stream={sync.state}
      view={view}
      observed={evidence.observed}
      onStart={() => void sync.start()}
      onOtpChange={sync.setOtpDraft}
      onOtpSubmit={(bank) => void sync.submitOtp(bank)}
    />
  );
}

export type FirstSyncBodyProps = {
  readonly navigation: StepNavigation;
  readonly load: ConnectedLoad;
  readonly stream: SyncStreamState;
  readonly view: FirstSyncView;
  /** Institution ids this install has synced successfully; omitted means no evidence. */
  readonly observed?: ReadonlySet<string>;
  readonly onStart: () => void;
  readonly onOtpChange: (bank: string, code: string) => void;
  readonly onOtpSubmit: (bank: string) => void;
};

export function FirstSyncBody({
  navigation,
  load,
  stream,
  view,
  observed = NOTHING_OBSERVED,
  onStart,
  onOtpChange,
  onOtpSubmit,
}: FirstSyncBodyProps) {
  const footer = firstSyncFooter(view);
  const primary: StepFooterPrimary = {
    wait: { disabled: true },
    start: { label: "התחלת סנכרון", onClick: onStart },
    busy: { label: "מסנכרן...", pending: true },
    finish: {},
  }[footer.primary];
  const footerNavigation = { ...navigation, skip: footer.skip ? navigation.skip : null };

  return (
    <div className="flex flex-col gap-6">
      {view.phase === "loading" && (
        <div aria-busy="true" className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      )}

      {view.phase === "unavailable" && (
        <Callout role="alert" icon={<InfoIcon className="text-muted-foreground" />}>
          לא הצלחנו לטעון את החשבונות המחוברים. אפשר לסיים עכשיו ולסנכרן מאוחר יותר מעמוד הסנכרון.
        </Callout>
      )}

      {view.phase === "no-credentials" && <NothingToSync />}

      {load.status === "ready" && load.connected.length > 0 && (
        <>
          <PhaseNote view={view} />
          <InstitutionList
            connected={load.connected}
            stream={stream}
            running={view.phase === "running"}
            observed={observed}
            onOtpChange={onOtpChange}
            onOtpSubmit={onOtpSubmit}
          />
          <Outcome view={view} stream={stream} onRetry={onStart} disabled={navigation.pending} />
        </>
      )}

      <StepFooter navigation={footerNavigation} primary={primary} />
    </div>
  );
}

function Callout({
  icon,
  role,
  children,
}: {
  icon: React.ReactNode;
  role?: "alert" | "status";
  children: React.ReactNode;
}) {
  return (
    <div role={role} className="bg-muted text-body flex items-start gap-3 rounded-lg p-4">
      <span className="mt-0.5 shrink-0 [&_svg]:size-5">{icon}</span>
      <div className="flex min-w-0 flex-col gap-1 leading-relaxed text-pretty">{children}</div>
    </div>
  );
}

function NothingToSync() {
  return (
    <div className="border-border flex flex-col items-start gap-4 rounded-xl border p-5">
      <span className="bg-muted flex size-12 items-center justify-center rounded-full">
        <BankIcon className="size-6" />
      </span>
      <div className="text-body flex flex-col gap-1">
        <p className="font-medium">עדיין לא חיברתם חשבון, ולכן אין מה לסנכרן.</p>
        <p className="text-muted-foreground text-pretty">
          אפשר לחזור ולחבר חשבון עכשיו, או לסיים ולחבר אותו מאוחר יותר בהגדרות.
        </p>
      </div>
      <Link
        href={INSTITUTION_STEP_HREF}
        className={buttonVariants({ variant: "outline", size: "lg", className: "min-h-11 px-4" })}
      >
        <PlusIcon />
        חיבור חשבון
      </Link>
    </div>
  );
}

function PhaseNote({ view }: { view: FirstSyncView }) {
  if (view.phase === "running") {
    return (
      <Callout icon={<ClockIcon className="text-muted-foreground" />}>
        הסנכרון פועל. השאירו את הדף פתוח עד שיסתיים — זה עשוי להימשך כמה דקות.
      </Callout>
    );
  }
  if (view.phase === "ready" && view.notice === null) {
    return (
      <p className="text-muted-foreground text-body leading-relaxed text-pretty">
        הסנכרון הראשון מושך את התנועות של השנה האחרונה, חשבון אחר חשבון, וכך גם מוודא שפרטי ההתחברות
        נכונים. אם יישלח אליכם קוד אימות ב-SMS, תתבקשו להזין אותו כאן.
      </p>
    );
  }
  return null;
}

function InstitutionList({
  connected,
  stream,
  running,
  observed,
  onOtpChange,
  onOtpSubmit,
}: {
  connected: readonly ConnectedInstitution[];
  stream: SyncStreamState;
  running: boolean;
  observed: ReadonlySet<string>;
  onOtpChange: (bank: string, code: string) => void;
  onOtpSubmit: (bank: string) => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-muted-foreground text-caption font-medium">חשבונות מחוברים</h2>
      <ul className="border-border divide-border flex flex-col divide-y rounded-xl border">
        {connected.map((institution) => {
          const live = stream.bankStates[institution.bankType];
          const trust = bankTrustOf(institution.bankType, observed);
          const failureNote =
            live?.status === "error" ? unverifiedFailureNote(institution.bankType, trust) : null;
          const progress = syncStageProgress(live?.status);
          return (
            <li key={institution.id} className="flex flex-col gap-3 px-4 py-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <InstitutionIdentity
                  bankType={institution.bankType}
                  displayName={institution.displayName}
                >
                  <InstitutionTrustBadge trust={trust} />
                </InstitutionIdentity>
                <p aria-live="polite" className="text-body ms-auto flex items-center gap-1.5">
                  <RowStatus state={live} running={running} />
                </p>
              </div>
              {progress !== null && (
                <div aria-hidden="true" className="bg-muted h-1.5 overflow-hidden rounded-full">
                  <div
                    className="bg-bar-strong h-full origin-right rounded-full transition-transform duration-500 ease-out motion-reduce:transition-none"
                    style={{ transform: `scaleX(${progress})` }}
                  />
                </div>
              )}
              {failureNote && (
                <p className="text-muted-foreground text-body text-pretty">{failureNote}</p>
              )}
              {live?.screenshotFilename && (
                <a
                  href={`/api/screenshots/${live.screenshotFilename}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary text-body inline-flex min-h-11 items-center self-start underline-offset-4 hover:underline"
                >
                  צפה בצילום מסך
                </a>
              )}
              {live?.status === "otp_required" && (
                <OtpEntry
                  code={stream.otpDrafts[institution.bankType] ?? ""}
                  secondsLeft={stream.otp[institution.bankType]?.secondsLeft}
                  onCodeChange={(code) => onOtpChange(institution.bankType, code)}
                  onSubmit={() => onOtpSubmit(institution.bankType)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * One institution's state in words beside an icon, so no outcome is told by
 * colour alone. A failure or a missed OTP is an attention state (ADR-0015:
 * coral means attention), never the red of negative money.
 */
function RowStatus({ state, running }: { state: BankSyncState | undefined; running: boolean }) {
  if (!state || state.status === "idle") {
    return (
      <span className="text-muted-foreground flex items-center gap-1.5">
        {running && <ClockIcon className="size-4 shrink-0" />}
        {running ? "ממתין לתורו" : "ממתין"}
      </span>
    );
  }
  switch (state.status) {
    case "complete":
      return (
        <span className="flex items-center gap-1.5 font-medium">
          <CheckCircleIcon className="text-pos size-4 shrink-0" />
          {state.transactionCount !== undefined
            ? `${state.transactionCount} תנועות`
            : STATUS_TEXT.complete}
        </span>
      );
    case "otp_required":
    case "otp_timeout":
      return (
        <span className="text-attention-text flex items-center gap-1.5 font-medium">
          <WarningCircleIcon className="size-4 shrink-0" />
          {STATUS_TEXT[state.status]}
        </span>
      );
    case "error":
      return (
        <span className="text-attention-text flex items-center gap-1.5 font-medium">
          <WarningCircleIcon className="size-4 shrink-0" />
          {state.error ?? STATUS_TEXT.error}
        </span>
      );
    case "interrupted":
      return (
        <span className="text-muted-foreground flex items-center gap-1.5">
          <PauseIcon className="size-4 shrink-0" />
          {STATUS_TEXT.interrupted}
        </span>
      );
    default:
      return (
        <span className="text-muted-foreground flex items-center gap-1.5">
          <ArrowsClockwiseIcon className="size-4 shrink-0" />
          {STATUS_TEXT[state.status]}
        </span>
      );
  }
}

function Outcome({
  view,
  stream,
  onRetry,
  disabled,
}: {
  view: FirstSyncView;
  stream: SyncStreamState;
  onRetry: () => void;
  disabled: boolean;
}) {
  const aiLines = stream.aiSummary ? aiSummaryLines(stream.aiSummary) : [];
  const settled = view.phase === "ready" || view.phase === "finished";
  const needsFix =
    settled && (view.failedInstitution || (view.phase === "finished" && view.retryable));

  return (
    <>
      {view.notice?.kind === "refused" && (
        <Callout role="status" icon={<InfoIcon className="text-muted-foreground" />}>
          {view.notice.message}
        </Callout>
      )}
      {view.notice?.kind === "connection-error" && (
        <Callout role="alert" icon={<WarningCircleIcon className="text-attention-text" />}>
          החיבור לשרת נותק לפני שהסנכרון הסתיים. אפשר לנסות שוב.
        </Callout>
      )}

      {view.phase === "finished" && stream.summary && (
        <Callout role="status" icon={<CheckCircleIcon className="text-pos" />}>
          <p className="font-medium">הסנכרון הסתיים</p>
          <p className="text-muted-foreground">{`סה"כ ${stream.summary.total} תנועות יובאו`}</p>
          {aiLines.map((line) => (
            <p key={line} className="text-muted-foreground">
              {line}
            </p>
          ))}
        </Callout>
      )}

      {needsFix && (
        <div className="border-attention flex flex-col gap-3 rounded-xl border p-4">
          {view.failedInstitution && (
            <p className="text-body flex items-start gap-2 text-pretty">
              <WarningCircleIcon className="text-attention-text mt-0.5 size-5 shrink-0" />
              <span>
                אם פרטי ההתחברות שגויים, חזרו לשלב החשבון, הסירו את החשבון וחברו אותו מחדש עם הפרטים
                הנכונים.
              </span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {view.failedInstitution && (
              <Link
                href={INSTITUTION_STEP_HREF}
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                  className: "min-h-11 px-4",
                })}
              >
                חזרה לשלב החשבון
              </Link>
            )}
            {view.phase === "finished" && view.retryable && (
              <Button
                variant="outline"
                size="lg"
                className="min-h-11 px-4"
                onClick={onRetry}
                disabled={disabled}
              >
                <ArrowsClockwiseIcon />
                ניסיון חוזר
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
