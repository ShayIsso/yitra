"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardPanel } from "@/components/dashboard-panel";
import { awaitsCode } from "@/components/bank-status-view";
import { monthKey } from "@/components/reports/format";
import { useSyncStream } from "@/components/sync-stream";
import type { Category } from "@/lib/categories";
import type { SyncRunSummary } from "@/lib/sync/runs";
import { FreshnessIndicator } from "./freshness-indicator";
import { homeFreshness } from "./freshness";
import { CONNECTION_LOST, FirstSyncHero, type HomeBank } from "./first-sync-hero";
import {
  ActiveBody,
  ClosedBody,
  NoConnectionBody,
  NoTargetBody,
  ThinHistoryBody,
} from "./hero-states";
import { HeroBodySkeleton, HeroError, MonthHero } from "./month-hero";
import { useMonthLoad } from "./month-load";
import { MonthNav } from "./month-nav";
import {
  HOME_MONTH_PARAM,
  compareMonths,
  homeHref,
  parseMonthParam,
  sameMonth,
  shiftMonth,
  type HomeMonth,
} from "./month";
import type { OutlookResponse } from "./outlook-view";

// Both dialogs open on demand only, so they stay out of the home route's first load.
const OtpSheet = dynamic(() => import("@/components/sync-otp-sheet").then((m) => m.OtpSheet), {
  ssr: false,
});
const TargetDialog = dynamic(() => import("./target-dialog"), { ssr: false });

/** How often the hero re-reads the outlook while a first sync runs that this tab doesn't drive. */
const FIRST_SYNC_POLL_MS = 4000;

/** Keeps "updated 5 minutes ago" and staleness moving while the page stays open. */
const CLOCK_TICK_MS = 60_000;

async function readJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<T>;
}

type MonthOutlookLoad = { month: HomeMonth; outlook: OutlookResponse };

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
  // By value: `router.refresh()` re-renders the page and hands a new object.
  const { year: currentYear, month: currentMonthNumber } = currentMonth;
  const current = React.useMemo(
    () => ({ year: currentYear, month: currentMonthNumber }),
    [currentYear, currentMonthNumber],
  );
  const month = parseMonthParam(searchParams.get(HOME_MONTH_PARAM), current);
  const key = monthKey(month);

  /** Bumped whenever the data under the screen changed: a sync settled, a target was saved. */
  const [version, setVersion] = React.useState(0);
  const [runs, setRuns] = React.useState<SyncRunSummary[] | null>(null);
  /** The client clock, read only after mount (bug #193: no clock in the SSR path). */
  const [nowMs, setNowMs] = React.useState<number | null>(null);
  const [targetOpen, setTargetOpen] = React.useState(false);
  const [dismissedOtpBank, setDismissedOtpBank] = React.useState<string | null>(null);

  const outlook = useMonthLoad<MonthOutlookLoad>(key, version, async (signal) => {
    const data = await readJson<OutlookResponse>(
      `/api/month-outlook?year=${month.year}&month=${month.month}`,
      signal,
    );
    setNowMs(Date.now());
    return { month, outlook: data };
  });

  const sync = useSyncStream({
    // Every outcome re-reads: a run that dropped mid-way kept what it
    // imported, and a refused start means a run is live elsewhere, which the
    // outlook's progress (and its polling) shows.
    onSettled: () => {
      setVersion((v) => v + 1);
      // The shell's pending-reconciliation badge is server-rendered.
      router.refresh();
    },
  });
  const stream = sync.state;

  React.useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    readJson<SyncRunSummary[]>("/api/sync-runs", controller.signal)
      .then(setRuns)
      // Freshness falls back to the outlook's own staleness; the hero still renders.
      .catch(() => {});
    return () => controller.abort();
  }, [version]);

  const live = stream.starting || stream.syncing;
  const shown = outlook.data && nowMs !== null ? { ...outlook.data, nowMs } : null;
  const data = shown?.outlook ?? null;
  const firstSyncElsewhere =
    outlook.current && data?.state === "first-sync" && data.progress.running && !live;

  React.useEffect(() => {
    if (!firstSyncElsewhere) return;
    const timer = setTimeout(() => setVersion((v) => v + 1), FIRST_SYNC_POLL_MS);
    return () => clearTimeout(timer);
  }, [firstSyncElsewhere, data]);

  const select = React.useCallback(
    (next: HomeMonth) => {
      if (compareMonths(next, current) > 0 || sameMonth(next, month)) return;
      window.history.pushState(null, "", homeHref(next, current));
    },
    [current, month],
  );

  const codeBank =
    banks.find((bank) => awaitsCode(stream.bankStates[bank.bankType], stream.otp[bank.bankType]))
      ?.bankType ?? null;
  const otpBank = banks.find((bank) => bank.bankType === codeBank) ?? null;
  const reopenCode = () => setDismissedOtpBank(null);

  function startSync() {
    setDismissedOtpBank(null);
    void sync.start();
  }

  const freshness = homeFreshness({
    runs: runs ?? [],
    asOf: data && "asOf" in data ? data.asOf : null,
    stale: data !== null && "stale" in data && data.stale,
    nowMs,
    live: { syncing: live, codeBank },
  });

  const welcoming = data?.state === "no-connection" || data?.state === "first-sync";
  // The sections load from the start, beside the outlook, but are drawn only
  // once it has answered and isn't a first-run state: nothing flashes for a
  // new user, and sections appended under a settled hero shift nothing.
  const answered = outlook.data !== null || outlook.failed;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-headline font-bold">לוח בקרה</h1>
        <MonthNav selected={month} current={current} onSelect={select} />
      </header>

      <MonthHero
        month={month}
        busy={!outlook.current && shown !== null}
        onStep={(delta) => select(shiftMonth(month, delta))}
        indicator={
          !welcoming && (
            <FreshnessIndicator
              freshness={freshness}
              onSyncNow={startSync}
              onEnterCode={reopenCode}
            />
          )
        }
      >
        {outlook.current && outlook.failed ? (
          <HeroError retrying={outlook.pending} onRetry={() => setVersion((v) => v + 1)} />
        ) : shown === null ? (
          <HeroBodySkeleton />
        ) : (
          // Keyed by month and state: the entrance plays when the content is
          // new, never on a refetch of the same month (ADR-0015 "Motion").
          <div key={`${monthKey(shown.month)}:${shown.outlook.state}`} className="enter">
            {(() => {
              const o = shown.outlook;
              switch (o.state) {
                case "no-connection":
                  return <NoConnectionBody />;
                case "first-sync":
                  return (
                    <FirstSyncHero
                      outlook={o}
                      banks={banks}
                      stream={stream}
                      onStart={startSync}
                      onEnterCode={reopenCode}
                    />
                  );
                case "no-target":
                  return (
                    <NoTargetBody
                      outlook={o}
                      nowMs={shown.nowMs}
                      onSetTarget={() => setTargetOpen(true)}
                    />
                  );
                case "thin-history":
                  return (
                    <ThinHistoryBody
                      outlook={o}
                      nowMs={shown.nowMs}
                      onSetTarget={() => setTargetOpen(true)}
                    />
                  );
                case "active":
                  return <ActiveBody outlook={o} nowMs={shown.nowMs} />;
                case "closed":
                  return <ClosedBody outlook={o} month={shown.month} nowMs={shown.nowMs} />;
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
          {stream.refusal ?? CONNECTION_LOST}
        </p>
      )}

      {banks.length > 0 && (
        <DashboardPanel
          categories={categories}
          month={month}
          refreshKey={version}
          visible={answered && !welcoming}
          credentialCount={banks.length}
          lastSyncRuns={runs}
        />
      )}

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

      {targetOpen && shown && (data?.state === "no-target" || data?.state === "thin-history") && (
        <TargetDialog
          month={shown.month}
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
