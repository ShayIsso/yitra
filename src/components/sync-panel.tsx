"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, AlertTriangle, Lock, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { BankBadge } from "@/components/bank-badge";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import { EmptyState } from "@/components/empty-state";
import { aiSummaryLines } from "@/components/ai-summary-lines";
import { LiveBankStatus, OtpEntry, STATUS_TEXT } from "@/components/sync-bank-status";
import { useSyncStream, type BankSyncState } from "@/components/sync-stream";
import { takeFrames } from "@/lib/sse-frames";
import { bankLabel, bankTrustOf } from "@/lib/bank-registry";
import { InstitutionTrustBadge, unverifiedFailureNote } from "@/components/institution-trust";
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

/**
 * Mirrors sync-freshness-pill.tsx's bucket wording (minutes/hours/days) so a
 * persisted row here and the header pill never disagree on how "3 hours ago"
 * reads. Not imported from there: the pill only exports its classifier
 * (`classifySyncFreshness`), not this formatter, and #223's brief keeps that
 * file read-only — duplicating one small clock-free formatter costs less
 * than widening that file's surface for it. Takes `ageMs`, never a `Date`,
 * so it can't reintroduce the `Date.now()`-in-render pattern that is bug
 * #193.
 */
export function formatRelativeAge(ageMs: number): string {
  const minutes = Math.floor(ageMs / (60 * 1000));
  if (minutes < 1) return "לפני פחות מדקה";
  if (minutes < 60) return `לפני ${minutes} דקות`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `לפני ${hours} שעות`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "אתמול";
  return `לפני ${days} ימים`;
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

function SyncPanelInner({ banks, lastRuns, observedInstitutions = [] }: SyncPanelProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  // ?bank=<bankType> deep-link target — highlights the flagged bank card
  const highlightedBank = searchParams.get("bank");
  const lastRunByBank = useMemo(() => {
    const map: Record<string, SyncRunSummary> = {};
    for (const run of lastRuns) map[run.bank] = run;
    return map;
  }, [lastRuns]);
  // Mounted-only clock seed — SSR and the hydration pass render the
  // no-age form below; classification (and its `new Date()` reads) only
  // runs once this is set, so a clock read never happens in the render
  // path shared with SSR (bug #193's exact trap; same shape as
  // sync-freshness-pill.tsx's `nowMs`).
  const [nowMs, setNowMs] = useState<number | null>(null);
  const { state, start, setOtpDraft, submitOtp, dismissReconciliation } = useSyncStream({
    // Re-reads the recorded runs on the server, so an experimental institution
    // this run just synced loses its caveat. Live SSE state is never evidence.
    onComplete: () => router.refresh(),
  });
  const { bankStates, syncing, summary, aiSummary, connectionError, reconciliation, refusal } =
    state;
  const observed = useMemo(() => new Set(observedInstitutions), [observedInstitutions]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot mount flag, mirrors sync-freshness-pill.tsx's nowMs seed
    setNowMs(Date.now());
  }, []);

  if (banks.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        אין חשבונות בנק מוגדרים. הוסף חשבון בהגדרות כדי להתחיל לסנכרן.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button onClick={() => void start()} disabled={syncing}>
          {syncing ? (
            <>
              <Loader2 className="animate-spin" />
              מסנכרן...
            </>
          ) : (
            "סנכרון הכל"
          )}
        </Button>
        {connectionError && <p className="text-destructive text-sm">שגיאת חיבור. נסה שוב.</p>}
        {refusal && <p className="text-muted-foreground text-sm">{refusal}</p>}
      </div>

      {!syncing && !summary && Object.keys(bankStates).length === 0 && lastRuns.length === 0 && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={RefreshCw}
              heading="עדיין לא בוצע סנכרון"
              explainer="הפעל סנכרון כדי להוריד את העסקאות האחרונות מחשבונות הבנק שלך."
              cta={{ label: "סנכרן עכשיו", onClick: () => void start() }}
            />
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {banks.map((bank) => {
          const display = resolveBankDisplay(
            bankStates[bank.bankType],
            lastRunByBank[bank.bankType],
          );
          const liveState = display.source === "live" ? display.state : undefined;
          const isHighlighted = highlightedBank === bank.bankType;
          const persistedAge =
            display.source === "persisted" && nowMs !== null
              ? formatRelativeAge(nowMs - new Date(display.run.startedAt).getTime())
              : null;
          const trust = bankTrustOf(bank.bankType, observed);
          const failed =
            liveState?.status === "error" ||
            (display.source === "persisted" && display.run.status === "error");
          const failureNote = failed ? unverifiedFailureNote(bank.bankType, trust) : null;
          const canRetry =
            liveState?.status === "error" ||
            liveState?.status === "otp_timeout" ||
            (display.source === "persisted" &&
              (display.run.status === "error" || display.run.status === "otp_skipped"));

          return (
            <Card
              key={bank.id}
              className={isHighlighted ? "border-warning/50 ring-warning/25 ring-1" : undefined}
            >
              <CardContent className="space-y-3 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <BankBadge bankType={bank.bankType} />
                    <span className="font-medium">{bank.displayName}</span>
                    <InstitutionTrustBadge trust={trust} />
                  </div>

                  <div className="flex items-center gap-1.5 text-sm">
                    {display.source === "none" && (
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <span className="bg-muted-foreground/40 inline-block h-2 w-2 rounded-full" />
                        מעולם לא סונכרן
                      </span>
                    )}
                    {liveState !== undefined && <LiveBankStatus state={liveState} />}

                    {display.source === "persisted" && display.run.status === "success" && (
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" />
                        {`${display.run.transactionsImported} תנועות`}
                        {persistedAge && ` · ${persistedAge}`}
                      </span>
                    )}
                    {display.source === "persisted" && display.run.status === "otp_skipped" && (
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Lock className="h-4 w-4" />
                        <span className="bg-warning text-warning-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                          קוד אימות לא הוזן בזמן
                        </span>
                        {persistedAge && <span>{persistedAge}</span>}
                      </span>
                    )}
                    {display.source === "persisted" && display.run.status === "error" && (
                      <span className="text-destructive flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4" />
                        {display.run.errorMessage ?? STATUS_TEXT.error}
                        {persistedAge && ` · ${persistedAge}`}
                      </span>
                    )}
                  </div>
                </div>

                {failureNote && <p className="text-muted-foreground text-sm">{failureNote}</p>}

                {liveState?.status === "otp_required" && (
                  <OtpEntry
                    code={state.otpDrafts[bank.bankType] ?? ""}
                    secondsLeft={state.otp[bank.bankType]?.secondsLeft}
                    onCodeChange={(code) => setOtpDraft(bank.bankType, code)}
                    onSubmit={() => void submitOtp(bank.bankType)}
                  />
                )}

                {canRetry && (
                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" onClick={() => void start()}>
                      נסה שוב
                    </Button>
                    {liveState?.screenshotFilename && (
                      <a
                        href={`/api/screenshots/${liveState.screenshotFilename}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary text-xs hover:underline"
                      >
                        צפה בצילום מסך
                      </a>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {reconciliation && (
        <Toast variant="success" onDismiss={dismissReconciliation}>
          {reconciliation.autoApplied > 0 && (
            <p className="text-foreground">
              סווגו אוטומטית {reconciliation.autoApplied} עסקאות כהסדרת כרטיס אשראי
            </p>
          )}
          {reconciliation.queued > 0 && (
            <p className="text-muted-foreground">{reconciliation.queued} התאמות ממתינות לאישור</p>
          )}
        </Toast>
      )}

      {aiSummary && (
        <Card>
          <CardContent className="space-y-2 py-4">
            <p className="font-semibold">סיווג חכם</p>
            <div className="space-y-0.5 text-sm">
              {aiSummaryLines(aiSummary).map((line) => (
                <p key={line} className="text-muted-foreground">
                  {line}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {summary && (
        <Card>
          <CardContent className="space-y-2 py-4">
            <p className="font-semibold">סנכרון הושלם</p>
            <p className="text-muted-foreground text-sm">{`סה"כ תנועות: ${summary.total}`}</p>
            {Object.entries(summary.byBank).length > 0 && (
              <div className="space-y-1">
                {Object.entries(summary.byBank).map(([bank, count]) => (
                  <p key={bank} className="text-sm">
                    {bankLabel(bank)}: {count} תנועות
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
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
