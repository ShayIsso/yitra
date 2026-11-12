"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowsClockwiseIcon,
  BankIcon,
  CaretLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  InfoIcon,
  KeyIcon,
  SparkleIcon,
  WarningCircleIcon,
} from "@/components/icons";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BankBadge } from "@/components/bank-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { aiSummaryLines } from "@/components/ai-summary-lines";
import { BankStatus, BankStatusDetail, StageProgress } from "@/components/sync-bank-status";
import { OtpSheet } from "@/components/sync-otp-sheet";
import {
  awaitsCode,
  liveBankStatus,
  persistedBankStatus,
  type BankStatusView,
} from "@/components/bank-status-view";
import { useSyncStream, type BankSyncState, type SyncStreamState } from "@/components/sync-stream";
import { takeFrames } from "@/lib/sse-frames";
import { bankLabel, bankTrustOf } from "@/lib/bank-registry";
import { InstitutionTrustBadge, unverifiedFailureNote } from "@/components/institution-trust";
import { formatRelativeAge } from "@/components/relative-age";
import { cn } from "@/lib/utils";
import type { SyncRunSummary } from "@/lib/sync/runs";

export {
  hasSyncComplete,
  type BankSyncState,
  type ClientSyncEvent,
} from "@/components/sync-stream";

type Bank = {
  id: string;
  bankType: string;
  displayName: string;
};

// ── Persisted-row precedence (#223) ──────────────────────────────────────────

export type BankDisplay =
  | { source: "live"; state: BankSyncState }
  | { source: "persisted"; run: SyncRunSummary }
  | { source: "none" };

/**
 * Live SSE state always wins over the persisted `sync_runs` row — a sync
 * that's in progress (or one that just finished this session) is strictly
 * more current than the snapshot the page loaded with. The persisted row is
 * only ever a fallback for a bank this tab hasn't heard from yet (a fresh
 * page load, or a bank the current run hasn't reached). Precedence is
 * decided here, once, rather than left to fall out of which branch happens
 * to render first.
 */
export function resolveBankDisplay(
  liveState: BankSyncState | undefined,
  lastRun: SyncRunSummary | undefined,
): BankDisplay {
  if (liveState !== undefined) return { source: "live", state: liveState };
  if (lastRun !== undefined) return { source: "persisted", run: lastRun };
  return { source: "none" };
}

// ── SSE-over-fetch framing (#246 — EventSource can't read the 409 status) ───

export { takeFrames };

type SyncPanelProps = {
  banks: Bank[];
  lastRuns: SyncRunSummary[];
  /**
   * Institution ids with a recorded successful sync on this install. Omitted
   * means no evidence, which can only keep an experimental caveat showing.
   */
  observedInstitutions?: readonly string[];
};

/** Ended without importing: what the outcome counts as not synced. */
const UNFINISHED: ReadonlySet<BankSyncState["status"]> = new Set([
  "error",
  "otp_timeout",
  "interrupted",
]);

const SETTLED: ReadonlySet<BankSyncState["status"]> = new Set([...UNFINISHED, "complete"]);

/** 44px on phones, the compact control height from `md`. */
const ACTION_SIZE = "h-11 px-4 md:h-9";

/**
 * A link styled as a button, merged through `cn` as `<Button>` does: the
 * variant's border colour and the base's `border-transparent` are both
 * emitted, and stylesheet order would otherwise erase the outline's border.
 */
function linkButton(variant: "default" | "outline", className?: string) {
  return cn(buttonVariants({ variant }), ACTION_SIZE, className);
}

/** Retrying is starting the whole run again: the route syncs every bank, in order. */
function RetryButton({ onRetry, disabled }: { onRetry: () => void; disabled: boolean }) {
  return (
    <Button variant="outline" className={ACTION_SIZE} onClick={onRetry} disabled={disabled}>
      <ArrowsClockwiseIcon />
      נסה שוב
    </Button>
  );
}

function codeAwaited(stream: SyncStreamState, bankType: string): boolean {
  return awaitsCode(stream.bankStates[bankType], stream.otp[bankType]);
}

function SyncPanelInner({ banks, lastRuns, observedInstitutions = [] }: SyncPanelProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  // ?bank=<bankType> deep-link target — highlights the flagged bank row
  const highlightedBank = searchParams.get("bank");
  const lastRunByBank = useMemo(() => {
    const map: Record<string, SyncRunSummary> = {};
    for (const run of lastRuns) map[run.bank] = run;
    return map;
  }, [lastRuns]);
  // Mounted-only clock seed — SSR and the hydration pass render the
  // no-age form below; classification (and its `new Date()` reads) only
  // runs once this is set, so a clock read never happens in the render
  // path shared with SSR (bug #193's exact trap).
  const [nowMs, setNowMs] = useState<number | null>(null);
  // The bank whose code prompt the owner closed; reopened from its row.
  const [dismissedOtpBank, setDismissedOtpBank] = useState<string | null>(null);
  const { state, start, setOtpDraft, submitOtp } = useSyncStream({
    // Re-reads the recorded runs on the server, so an experimental institution
    // this run just synced loses its caveat (live SSE state is never evidence),
    // and the shell's pending-reconciliation badge picks up new matches.
    onComplete: () => router.refresh(),
  });
  const { bankStates, syncing, summary, aiSummary, connectionError, reconciliation, refusal } =
    state;
  const busy = syncing || state.starting;
  const observed = useMemo(() => new Set(observedInstitutions), [observedInstitutions]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot mount flag so SSR and hydration render the clock-free form (bug #193)
    setNowMs(Date.now());
  }, []);

  function startSync() {
    setDismissedOtpBank(null);
    void start();
  }

  if (banks.length === 0) {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <SyncHeader />
        <NoBanks />
      </div>
    );
  }

  const otpBank = banks.find((bank) => codeAwaited(state, bank.bankType)) ?? null;
  const neverSynced =
    !busy && !summary && Object.keys(bankStates).length === 0 && lastRuns.length === 0;
  const currentIndex = banks.findIndex((bank) => {
    const status = bankStates[bank.bankType]?.status;
    return status !== undefined && !SETTLED.has(status);
  });
  const unfinished = banks.filter((bank) => {
    const status = bankStates[bank.bankType]?.status;
    return status !== undefined && UNFINISHED.has(status);
  }).length;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <SyncHeader>
        <Button
          className="h-11 w-full px-5 sm:w-auto md:h-10"
          onClick={startSync}
          disabled={busy}
          aria-busy={busy || undefined}
        >
          <ArrowsClockwiseIcon className="size-5" />
          {busy ? "מסנכרן..." : "סנכרון הכל"}
        </Button>
      </SyncHeader>

      {neverSynced && (
        <Note icon={<InfoIcon className="text-muted-foreground" />}>
          <p className="font-medium">עדיין לא בוצע סנכרון</p>
          <p className="text-muted-foreground">
            הסנכרון הראשון מושך את התנועות של השנה האחרונה, חשבון אחר חשבון. אם הבנק ישלח קוד אימות
            ב-SMS, תתבקשו להזין אותו כאן.
          </p>
        </Note>
      )}

      {syncing && (
        <Note icon={<ClockIcon weight="fill" className="text-muted-foreground" />}>
          <p className="font-medium" aria-live="polite">
            {currentIndex === -1
              ? "מסיים את הסנכרון..."
              : `מסנכרן חשבון ${currentIndex + 1} מתוך ${banks.length}`}
          </p>
          <p className="text-muted-foreground">
            השאירו את הדף פתוח עד שהסנכרון יסתיים. יציאה מהדף תעצור אותו.
          </p>
        </Note>
      )}

      {refusal && (
        <Note role="status" icon={<InfoIcon className="text-muted-foreground" />}>
          <p>{refusal}</p>
        </Note>
      )}

      {connectionError && (
        <Note role="alert" tone="attention" icon={<WarningCircleIcon weight="fill" />}>
          <p className="font-medium">החיבור לשרת נותק לפני שהסנכרון הסתיים</p>
          <p className="text-muted-foreground">
            התנועות שכבר יובאו נשמרו. אפשר להפעיל את הסנכרון שוב.
          </p>
          <div className="mt-2">
            <RetryButton onRetry={startSync} disabled={busy} />
          </div>
        </Note>
      )}

      <section aria-labelledby="sync-banks-heading" className="flex flex-col gap-3">
        <h2 id="sync-banks-heading" className="text-lead font-semibold">
          חשבונות
        </h2>
        <Card className="gap-0 py-0">
          <ul className="divide-border divide-y">
            {banks.map((bank) => {
              const display = resolveBankDisplay(
                bankStates[bank.bankType],
                lastRunByBank[bank.bankType],
              );
              const liveState = display.source === "live" ? display.state : undefined;
              const persistedRun = display.source === "persisted" ? display.run : undefined;
              const age =
                persistedRun && nowMs !== null
                  ? formatRelativeAge(nowMs - new Date(persistedRun.startedAt).getTime())
                  : null;
              const showsLive = liveState !== undefined || syncing;
              const view: BankStatusView = showsLive
                ? liveBankStatus(liveState, { running: syncing, otp: state.otp[bank.bankType] })
                : persistedBankStatus(persistedRun);
              const trust = bankTrustOf(bank.bankType, observed);
              const failed = liveState?.status === "error" || persistedRun?.status === "error";
              const failureNote = failed ? unverifiedFailureNote(bank.bankType, trust) : null;
              const canRetry =
                liveState?.status === "error" ||
                liveState?.status === "otp_timeout" ||
                persistedRun?.status === "error" ||
                persistedRun?.status === "otp_skipped";
              // Offered only once the prompt was closed; while it is open the sheet is the way in.
              const waitingForCode =
                codeAwaited(state, bank.bankType) && dismissedOtpBank === bank.bankType;

              return (
                <li
                  key={bank.id}
                  data-highlighted={highlightedBank === bank.bankType || undefined}
                  className="data-highlighted:ring-attention flex flex-col gap-3 p-4 first:rounded-t-xl last:rounded-b-xl data-highlighted:ring-2 data-highlighted:ring-inset"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="bg-muted text-muted-foreground grid size-10 shrink-0 place-items-center rounded-full">
                        <BankIcon weight="duotone" className="size-5" />
                      </span>
                      <div className="flex min-w-0 flex-col gap-1">
                        <p className="text-lead truncate font-medium">{bank.displayName}</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <BankBadge bankType={bank.bankType} />
                          <InstitutionTrustBadge trust={trust} />
                        </div>
                      </div>
                    </div>
                    {/* On phones the status sits under the name, aligned past the icon. */}
                    <div className="flex shrink-0 flex-col items-start gap-0.5 ps-13 sm:ps-0">
                      <BankStatus view={view} />
                      {!showsLive && persistedRun && (
                        // Its line is reserved before the clock is read, so the age
                        // arriving after hydration moves nothing.
                        <span className="text-caption text-muted-foreground min-h-4 ps-5.5">
                          {age}
                        </span>
                      )}
                    </div>
                  </div>

                  <StageProgress value={view.progress} />

                  <BankStatusDetail view={view} />
                  {failureNote && (
                    <p className="text-muted-foreground text-body text-pretty">{failureNote}</p>
                  )}

                  {(canRetry || waitingForCode || liveState?.screenshotFilename) && (
                    <div className="flex flex-wrap items-center gap-2">
                      {waitingForCode && (
                        <Button className={ACTION_SIZE} onClick={() => setDismissedOtpBank(null)}>
                          <KeyIcon />
                          הזנת קוד
                        </Button>
                      )}
                      {canRetry && <RetryButton onRetry={startSync} disabled={busy} />}
                      {liveState?.screenshotFilename && (
                        <a
                          href={`/api/screenshots/${liveState.screenshotFilename}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary text-body inline-flex min-h-11 items-center px-1 underline-offset-4 hover:underline md:min-h-9"
                        >
                          צפה בצילום מסך
                        </a>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </section>

      {(summary || reconciliation || aiSummary) && (
        <RunOutcome
          summary={summary}
          unfinished={unfinished}
          reconciliation={reconciliation}
          aiSummary={aiSummary}
        />
      )}

      {otpBank && (
        <OtpSheet
          open={dismissedOtpBank !== otpBank.bankType}
          bankType={otpBank.bankType}
          displayName={otpBank.displayName}
          code={state.otpDrafts[otpBank.bankType] ?? ""}
          countdown={state.otp[otpBank.bankType]}
          onCodeChange={(code) => setOtpDraft(otpBank.bankType, code)}
          onSubmit={() => void submitOtp(otpBank.bankType)}
          onDismiss={() => setDismissedOtpBank(otpBank.bankType)}
        />
      )}
    </div>
  );
}

function SyncHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-headline font-bold">סנכרון</h1>
        <p className="text-muted-foreground text-body">
          משיכת התנועות מכל החשבונות המחוברים, חשבון אחר חשבון.
        </p>
      </div>
      {children}
    </header>
  );
}

/** The page while its runs load, laid out like the populated page: header, then the account rows. */
export function SyncPanelSkeleton() {
  return (
    <div aria-busy="true" className="flex max-w-3xl flex-col gap-6">
      <span role="status" className="sr-only">
        טוען את עמוד הסנכרון
      </span>
      <SyncHeader>
        <Skeleton className="h-11 w-full rounded-lg sm:w-32 md:h-10" />
      </SyncHeader>
      <div className="flex flex-col gap-3">
        <h2 className="text-lead font-semibold">חשבונות</h2>
        <Card className="gap-0 py-0">
          <div className="divide-border divide-y">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Skeleton className="size-10 shrink-0 rounded-full" />
                  <div className="flex flex-col gap-1">
                    <Skeleton className="h-6 w-36" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-start gap-0.5 ps-13 sm:ps-0">
                  <Skeleton className="h-[1.375rem] w-36" />
                  <Skeleton className="ms-5.5 h-4 w-16" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Note({
  icon,
  role,
  tone = "neutral",
  children,
}: {
  icon: React.ReactNode;
  role?: "alert" | "status";
  tone?: "neutral" | "attention";
  children: React.ReactNode;
}) {
  return (
    <div
      role={role}
      className={cn(
        "text-body flex items-start gap-3 rounded-xl p-4",
        tone === "attention" ? "bg-card border-attention border" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "mt-0.5 shrink-0 [&_svg]:size-5",
          tone === "attention" && "text-attention-text",
        )}
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-1 leading-relaxed text-pretty">{children}</div>
    </div>
  );
}

function NoBanks() {
  return (
    <Card className="items-center gap-0 px-6 py-12 text-center">
      <span className="bg-muted text-muted-foreground mb-4 grid size-14 place-items-center rounded-full">
        <BankIcon weight="duotone" className="size-7" />
      </span>
      <p className="text-lead font-semibold">עדיין לא חיברת חשבון</p>
      <p className="text-muted-foreground text-body mt-1.5 max-w-sm text-pretty">
        כדי לסנכרן תנועות, חברו חשבון בנק או כרטיס אשראי בהגדרות. אחר כך הסנכרון יתחיל מכאן.
      </p>
      <Link href="/settings" className={linkButton("default", "mt-5")}>
        חיבור חשבון בהגדרות
      </Link>
    </Card>
  );
}

function RunOutcome({
  summary,
  unfinished,
  reconciliation,
  aiSummary,
}: {
  summary: SyncStreamState["summary"];
  unfinished: number;
  reconciliation: SyncStreamState["reconciliation"];
  aiSummary: SyncStreamState["aiSummary"];
}) {
  const aiLines = aiSummary ? aiSummaryLines(aiSummary) : [];
  const partial = summary !== null && unfinished > 0;

  return (
    <section aria-labelledby="sync-outcome-heading" className="flex flex-col gap-3">
      <h2 id="sync-outcome-heading" className="text-lead font-semibold">
        תוצאות הסנכרון
      </h2>
      <Card className="gap-0 py-0">
        <div className="divide-border flex flex-col divide-y">
          {summary && (
            <div role="status" className="flex items-start gap-3 p-4">
              {partial ? (
                <WarningCircleIcon
                  weight="fill"
                  className="text-attention-text mt-0.5 size-5 shrink-0"
                />
              ) : (
                <CheckCircleIcon weight="fill" className="mt-0.5 size-5 shrink-0" />
              )}
              <div className="text-body flex min-w-0 flex-1 flex-col gap-1">
                <p className={cn("font-medium", partial && "text-attention-text")}>
                  {partial
                    ? unfinished === 1
                      ? "הסנכרון הסתיים, אבל חשבון אחד לא סונכרן"
                      : `הסנכרון הסתיים, אבל ${unfinished} חשבונות לא סונכרנו`
                    : "הסנכרון הושלם"}
                </p>
                <p className="text-muted-foreground">{`סה"כ תנועות: ${summary.total}`}</p>
                {Object.entries(summary.byBank).length > 0 && (
                  <ul className="text-muted-foreground">
                    {Object.entries(summary.byBank).map(([bank, count]) => (
                      <li key={bank}>{`${bankLabel(bank)}: ${count} תנועות`}</li>
                    ))}
                  </ul>
                )}
                {partial && (
                  <p className="text-muted-foreground">
                    הפרטים, ואפשרות לנסות שוב, מופיעים ליד כל חשבון.
                  </p>
                )}
              </div>
            </div>
          )}

          {reconciliation && (
            <div className="flex items-start gap-3 p-4">
              <CheckCircleIcon
                weight="fill"
                className="text-muted-foreground mt-0.5 size-5 shrink-0"
              />
              <div className="text-body flex min-w-0 flex-1 flex-col gap-1">
                <p className="font-medium">התאמות</p>
                {reconciliation.autoApplied > 0 && (
                  <p className="text-muted-foreground">
                    סווגו אוטומטית {reconciliation.autoApplied} עסקאות כהסדרת כרטיס אשראי
                  </p>
                )}
                {reconciliation.queued > 0 && (
                  <>
                    <p className="text-muted-foreground">
                      {reconciliation.queued} התאמות ממתינות לאישור
                    </p>
                    <div className="mt-2">
                      <Link href="/reconciliation" className={linkButton("outline")}>
                        לתיבת ההתאמות
                        <CaretLeftIcon />
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {aiLines.length > 0 && (
            <div className="flex items-start gap-3 p-4">
              <SparkleIcon
                weight="duotone"
                className="text-muted-foreground mt-0.5 size-5 shrink-0"
              />
              <div className="text-body flex min-w-0 flex-1 flex-col gap-1">
                <p className="font-medium">סיווג חכם</p>
                {aiLines.map((line) => (
                  <p key={line} className="text-muted-foreground">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}

// useSearchParams requires a Suspense boundary (Next.js App Router requirement)
export function SyncPanel(props: SyncPanelProps) {
  return (
    <Suspense fallback={null}>
      <SyncPanelInner {...props} />
    </Suspense>
  );
}
