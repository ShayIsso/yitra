"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Link2Off } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BankBadge } from "@/components/bank-badge";
import { aiSummaryLines } from "@/components/ai-summary-lines";
import { InstitutionTrustBadge, unverifiedFailureNote } from "@/components/institution-trust";
import { LiveBankStatus, OtpEntry } from "@/components/sync-bank-status";
import { useSyncStream, type SyncStreamState } from "@/components/sync-stream";
import { bankTrustOf } from "@/lib/bank-registry";
import { fetchConnectedInstitutions, type ConnectedInstitution } from "../connected-institutions";
import { StepFooter, type StepFooterPrimary } from "../step-footer";
import type { SetupStepProps, StepMeta, StepNavigation } from "../step-navigation";
import {
  deriveFirstSyncView,
  firstSyncFooter,
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

/** Nothing on a first sync has been observed yet, so trust is the registry's tier alone. */
const NOTHING_OBSERVED: ReadonlySet<string> = new Set();

/**
 * Leaving the step unmounts the stream, and the route then aborts the scrape
 * and releases the sync claim — so while a run is live, leaving is confirmed
 * rather than silent. The footer is already disabled; this covers the frame's
 * "continue later" link and a reload or tab close.
 */
function useLeaveGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    // Capture phase on the document runs before React's root listener, so a
    // declined confirm stops a Next.js <Link> before it routes.
    const onClick = (e: MouseEvent) => {
      const anchor = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!anchor || window.confirm(LEAVE_WARNING)) return;
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
  const sync = useSyncStream();

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
  readonly onStart: () => void;
  readonly onOtpChange: (bank: string, code: string) => void;
  readonly onOtpSubmit: (bank: string) => void;
};

export function FirstSyncBody({
  navigation,
  load,
  stream,
  view,
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
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {view.phase === "unavailable" && (
        <p role="alert" className="text-muted-foreground text-sm">
          לא הצלחנו לטעון את החשבונות המחוברים. אפשר לסיים עכשיו ולסנכרן מאוחר יותר מעמוד הסנכרון.
        </p>
      )}

      {view.phase === "no-credentials" && <NothingToSync />}

      {load.status === "ready" && load.connected.length > 0 && (
        <>
          <PhaseNote view={view} />
          <InstitutionList
            connected={load.connected}
            stream={stream}
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

function NothingToSync() {
  return (
    <div className="border-border flex flex-col gap-4 rounded-lg border px-4 py-5">
      <div className="flex items-start gap-3">
        <Link2Off className="text-muted-foreground mt-0.5 size-5 shrink-0" strokeWidth={1.5} />
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium">עדיין לא חיברתם חשבון, ולכן אין מה לסנכרן.</p>
          <p className="text-muted-foreground">
            אפשר לחזור ולחבר חשבון עכשיו, או לסיים ולחבר אותו מאוחר יותר בהגדרות.
          </p>
        </div>
      </div>
      <div>
        <Link href={INSTITUTION_STEP_HREF} className={buttonVariants({ variant: "outline" })}>
          חיבור חשבון
        </Link>
      </div>
    </div>
  );
}

function PhaseNote({ view }: { view: FirstSyncView }) {
  if (view.phase === "running") {
    return (
      <p className="text-muted-foreground text-sm">
        הסנכרון פועל. השאירו את הדף פתוח עד שיסתיים — זה עשוי להימשך כמה דקות.
      </p>
    );
  }
  if (view.phase === "ready" && view.notice === null) {
    return (
      <p className="text-muted-foreground text-sm leading-relaxed">
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
  onOtpChange,
  onOtpSubmit,
}: {
  connected: readonly ConnectedInstitution[];
  stream: SyncStreamState;
  onOtpChange: (bank: string, code: string) => void;
  onOtpSubmit: (bank: string) => void;
}) {
  return (
    <section className="border-border rounded-lg border">
      <h3 className="bg-muted/50 px-4 py-2 text-sm font-semibold">חשבונות מחוברים</h3>
      <ul className="divide-border flex flex-col divide-y">
        {connected.map((institution) => {
          const live = stream.bankStates[institution.bankType];
          const trust = bankTrustOf(institution.bankType, NOTHING_OBSERVED);
          const failureNote =
            live?.status === "error" ? unverifiedFailureNote(institution.bankType, trust) : null;
          return (
            <li key={institution.id} className="flex flex-col gap-3 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex min-w-0 items-center gap-3">
                  <BankBadge bankType={institution.bankType} />
                  <span className="truncate">{institution.displayName}</span>
                  <InstitutionTrustBadge trust={trust} />
                </div>
                <div className="flex items-center gap-1.5">
                  {live ? (
                    <LiveBankStatus state={live} />
                  ) : (
                    <span className="text-muted-foreground">ממתין</span>
                  )}
                </div>
              </div>
              {failureNote && <p className="text-muted-foreground text-sm">{failureNote}</p>}
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

  return (
    <>
      {view.notice?.kind === "refused" && (
        <p role="status" className="text-muted-foreground text-sm">
          {view.notice.message}
        </p>
      )}
      {view.notice?.kind === "connection-error" && (
        <p role="alert" className="text-destructive text-sm">
          החיבור לשרת נותק לפני שהסנכרון הסתיים. אפשר לנסות שוב.
        </p>
      )}

      {view.phase === "finished" && stream.summary && (
        <div className="border-border flex flex-col gap-1.5 rounded-lg border px-4 py-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="size-4" />
            הסנכרון הסתיים
          </p>
          <p className="text-muted-foreground">{`סה"כ ${stream.summary.total} תנועות יובאו`}</p>
          {aiLines.map((line) => (
            <p key={line} className="text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
      )}

      {settled && (view.credentialFailure || (view.phase === "finished" && view.retryable)) && (
        <div className="flex flex-col gap-3">
          {view.credentialFailure && (
            <p className="text-muted-foreground text-sm">
              אם פרטי ההתחברות שגויים, אפשר לחזור לשלב החשבון, או לעדכן אותם מאוחר יותר בהגדרות.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {view.credentialFailure && (
              <Link href={INSTITUTION_STEP_HREF} className={buttonVariants({ variant: "outline" })}>
                חזרה לשלב החשבון
              </Link>
            )}
            {view.phase === "finished" && view.retryable && (
              <Button variant="outline" onClick={onRetry} disabled={disabled}>
                ניסיון חוזר
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
