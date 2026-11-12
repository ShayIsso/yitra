"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardPanel } from "@/components/dashboard-panel";
import { awaitsCode } from "@/components/bank-status-view";
import { useSyncStream } from "@/components/sync-stream";
import type { Category } from "@/lib/categories";
import type { SyncRunSummary } from "@/lib/sync/runs";
import { FreshnessIndicator } from "./freshness-indicator";
import { homeFreshness } from "./freshness";
import { FirstSyncHero, type HomeBank } from "./first-sync-hero";
import {
  ActiveBody,
  ClosedBody,
  NoConnectionBody,
  NoTargetBody,
  ThinHistoryBody,
} from "./hero-states";
import { HeroBodySkeleton, HeroError, MonthHero } from "./month-hero";
import { MonthNav } from "./month-nav";
import {
  HOME_MONTH_PARAM,
  compareMonths,
  homeHref,
  monthParam,
  parseMonthParam,
  shiftMonth,
  type HomeMonth,
} from "./month";
import type { OutlookResponse } from "./outlook-view";

// Both dialogs open on demand only, so they stay out of the home route's first load.
const OtpSheet = dynamic(() => import("@/components/sync-otp-sheet").then((m) => m.OtpSheet), {
  ssr: false,
});
const TargetDialog = dynamic(() => import("./target-dialog"), { ssr: false });

type OutlookLoad =
  | { key: string; status: "ready"; data: OutlookResponse; receivedAt: number }
  | { key: string; status: "error" };

/** How often the hero re-reads the outlook while a first sync runs that this tab doesn't drive. */
const FIRST_SYNC_POLL_MS = 4000;

/**
 * The home screen (#317): month navigation, the month-outlook hero and, below
 * it, the sections later home tickets replace. The selected month lives in the
 * URL (`/?month=YYYY-MM`); it changes through `history.pushState`, which the
 * App Router syncs into `useSearchParams` without a server round trip, so a
 * month switch is instant and back/forward walk the months.
 */
export function HomeScreen({
  currentMonth,
  categories,
  banks,
}: {
  /** On the home calendar day, decided by the server so SSR and hydration agree. */
  currentMonth: HomeMonth;
  categories: Category[];
  /** Connected institutions, in sync order. */
  banks: HomeBank[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const month = parseMonthParam(searchParams.get(HOME_MONTH_PARAM), currentMonth);
  const key = monthParam(month);

  const [outlook, setOutlook] = React.useState<OutlookLoad | null>(null);
  const [runs, setRuns] = React.useState<SyncRunSummary[]>([]);
  const [retrying, setRetrying] = React.useState(false);
  /** Bumped whenever the data under the screen changed: a sync finished, a target was saved. */
  const [version, setVersion] = React.useState(0);
  const [attempt, setAttempt] = React.useState(0);
  const [targetOpen, setTargetOpen] = React.useState(false);
  const [dismissedOtpBank, setDismissedOtpBank] = React.useState<string | null>(null);

  const sync = useSyncStream({
    onComplete: () => {
      setVersion((v) => v + 1);
      // The shell's pending-reconciliation badge is server-rendered.
      router.refresh();
    },
  });
  const stream = sync.state;

  React.useEffect(() => {
    const controller = new AbortController();
    const [year, m] = key.split("-").map(Number);
    fetch(`/api/month-outlook?year=${year}&month=${m}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: OutlookResponse) =>
        setOutlook({ key, status: "ready", data, receivedAt: Date.now() }),
      )
      .catch(() => {
        if (!controller.signal.aborted) setOutlook({ key, status: "error" });
      })
      .finally(() => {
        if (!controller.signal.aborted) setRetrying(false);
      });
    return () => controller.abort();
  }, [key, version, attempt]);

  React.useEffect(() => {
    const controller = new AbortController();
    fetch("/api/sync-runs", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: SyncRunSummary[]) => setRuns(data))
      // Freshness falls back to the outlook's own staleness; the hero still renders.
      .catch(() => {});
    return () => controller.abort();
  }, [version]);

  const live = stream.starting || stream.syncing;
  const current = outlook?.key === key ? outlook : null;
  const shown = outlook?.status === "ready" ? outlook : null;
  const firstSyncElsewhere =
    current?.status === "ready" &&
    current.data.state === "first-sync" &&
    current.data.progress.running &&
    !live;

  React.useEffect(() => {
    if (!firstSyncElsewhere) return;
    const timer = setTimeout(() => setVersion((v) => v + 1), FIRST_SYNC_POLL_MS);
    return () => clearTimeout(timer);
  }, [firstSyncElsewhere, outlook]);

  const select = React.useCallback(
    (next: HomeMonth) => {
      if (compareMonths(next, currentMonth) > 0) return;
      window.history.pushState(null, "", homeHref(next, currentMonth));
    },
    [currentMonth],
  );

  const codeBank =
    banks.find((bank) => awaitsCode(stream.bankStates[bank.bankType], stream.otp[bank.bankType]))
      ?.bankType ?? null;
  const otpBank = banks.find((bank) => bank.bankType === codeBank) ?? null;

  function startSync() {
    setDismissedOtpBank(null);
    void sync.start();
  }

  const data = shown?.data ?? null;
  const freshness = homeFreshness({
    runs,
    asOf: data && "asOf" in data ? data.asOf : null,
    stale: data !== null && "stale" in data && data.stale,
    nowMs: shown?.receivedAt ?? null,
    live: { syncing: live, codeBank },
  });

  const welcoming = data?.state === "no-connection" || data?.state === "first-sync";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-headline font-bold">לוח בקרה</h1>
        <MonthNav selected={month} current={currentMonth} onSelect={select} />
      </header>

      <MonthHero
        month={month}
        busy={current === null && shown !== null}
        onStep={(delta) => select(shiftMonth(month, delta))}
        indicator={
          !welcoming && (
            <FreshnessIndicator
              freshness={freshness}
              onSyncNow={startSync}
              onEnterCode={() => setDismissedOtpBank(null)}
            />
          )
        }
      >
        {current?.status === "error" ? (
          <HeroError
            retrying={retrying}
            onRetry={() => {
              setRetrying(true);
              setAttempt((a) => a + 1);
            }}
          />
        ) : shown === null ? (
          <HeroBodySkeleton />
        ) : (
          // Keyed by month and state: the entrance plays when the content is
          // new, never on a refetch of the same month (ADR-0015 "Motion").
          <div key={`${shown.key}:${shown.data.state}`} className="enter">
            {(() => {
              const o = shown.data;
              const nowMs = shown.receivedAt;
              switch (o.state) {
                case "no-connection":
                  return <NoConnectionBody />;
                case "first-sync":
                  return (
                    <FirstSyncHero outlook={o} banks={banks} stream={stream} onStart={startSync} />
                  );
                case "no-target":
                  return (
                    <NoTargetBody
                      outlook={o}
                      nowMs={nowMs}
                      onSetTarget={() => setTargetOpen(true)}
                    />
                  );
                case "thin-history":
                  return (
                    <ThinHistoryBody
                      outlook={o}
                      nowMs={nowMs}
                      onSetTarget={() => setTargetOpen(true)}
                    />
                  );
                case "active":
                  return <ActiveBody outlook={o} nowMs={nowMs} />;
                case "closed":
                  return (
                    <ClosedBody
                      outlook={o}
                      month={parseMonthParam(shown.key, currentMonth)}
                      nowMs={nowMs}
                    />
                  );
              }
            })()}
          </div>
        )}
      </MonthHero>

      {live && !welcoming && (
        <p role="status" className="text-muted-foreground text-body -mt-3">
          מסנכרן את החשבונות. השאירו את הדף פתוח עד שהסנכרון יסתיים.
        </p>
      )}
      {!welcoming && (stream.refusal || stream.connectionError) && (
        <p role="status" className="text-muted-foreground text-body -mt-3">
          {stream.refusal ?? "החיבור לשרת נותק לפני שהסנכרון הסתיים. התנועות שכבר יובאו נשמרו."}
        </p>
      )}

      {!welcoming && <DashboardPanel categories={categories} month={month} refreshKey={version} />}

      {otpBank && (
        <OtpSheet
          open={dismissedOtpBank !== otpBank.bankType}
          bankType={otpBank.bankType}
          displayName={otpBank.displayName}
          code={stream.otpDrafts[otpBank.bankType] ?? ""}
          countdown={stream.otp[otpBank.bankType]}
          onCodeChange={(code) => sync.setOtpDraft(otpBank.bankType, code)}
          onSubmit={() => void sync.submitOtp(otpBank.bankType)}
          onDismiss={() => setDismissedOtpBank(otpBank.bankType)}
        />
      )}

      {targetOpen && data && (data.state === "no-target" || data.state === "thin-history") && (
        <TargetDialog
          month={month}
          suggested={data.state === "no-target" ? data.suggestedTarget : null}
          usualMonth={data.state === "no-target" ? data.usualMonth : null}
          onClose={() => setTargetOpen(false)}
          onSaved={() => {
            setTargetOpen(false);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}
