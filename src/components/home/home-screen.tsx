"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardPanel } from "@/components/dashboard-panel";
import { awaitsCode } from "@/components/bank-status-view";
import { monthKey } from "@/components/reports/format";
import { useSyncStream } from "@/components/sync-stream";
import type { MonthlyTargetsData } from "@/lib/budgets";
import type { Category } from "@/lib/categories";
import type { SyncRunSummary } from "@/lib/sync/runs";
import { firstSyncRunEnded, runsSignature } from "./first-sync-watch";
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
  homeHref,
  isBrowsable,
  parseMonthParam,
  sameMonth,
  shiftMonth,
  type HomeMonth,
  type MonthRange,
} from "./month";
import type { OutlookResponse } from "./outlook-view";

// Both dialogs open on demand only, so they stay out of the home route's first load.
const OtpSheet = dynamic(() => import("@/components/sync-otp-sheet").then((m) => m.OtpSheet), {
  ssr: false,
});
const TargetDialog = dynamic(() => import("./target-dialog"), { ssr: false });

/**
 * While a first sync this tab doesn't drive is running, the cheap
 * last-run-per-bank read is polled this often; the outlook (about ten DB
 * reads) is re-read only when that moves, or every SAFETY_TICKS polls in
 * case the run ends without a run row changing (a categorization backfill
 * holds the same claim).
 */
const FIRST_SYNC_POLL_MS = 4000;
const FIRST_SYNC_SAFETY_TICKS = 8;

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
  range: rangeProp,
  categories,
  banks,
}: {
  /**
   * From the first month with data to the current one on the home calendar
   * day, decided by the server so SSR and hydration agree.
   */
  range: MonthRange;
  categories: Category[];
  /** Connected institutions (the registry still knows them), in sync order. */
  banks: HomeBank[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // By value: `router.refresh()` re-renders the page and hands new objects.
  const { year: firstYear, month: firstMonth } = rangeProp.first;
  const { year: currentYear, month: currentMonth } = rangeProp.current;
  const range = React.useMemo<MonthRange>(
    () => ({
      first: { year: firstYear, month: firstMonth },
      current: { year: currentYear, month: currentMonth },
    }),
    [firstYear, firstMonth, currentYear, currentMonth],
  );
  const param = searchParams.get(HOME_MONTH_PARAM);
  const month = React.useMemo(() => parseMonthParam(param, range), [param, range]);
  const key = monthKey(month);

  /** Bumped whenever the data under the screen changed: a sync settled, a target was saved. */
  const [version, setVersion] = React.useState(0);
  /** Re-reads the outlook alone: a retry, or a poll while a first sync runs elsewhere. */
  const [outlookNudge, setOutlookNudge] = React.useState(0);
  const [runs, setRuns] = React.useState<SyncRunSummary[] | null>(null);
  /** The monthly targets as the sections last read them; the target dialog writes them back. */
  const [targets, setTargets] = React.useState<MonthlyTargetsData | null>(null);
  /** The client clock, read only after mount (bug #193: no clock in the SSR path). */
  const [nowMs, setNowMs] = React.useState<number | null>(null);
  const [targetOpen, setTargetOpen] = React.useState(false);
  const [dismissedOtpBank, setDismissedOtpBank] = React.useState<string | null>(null);

  const refreshAll = React.useCallback(() => {
    setVersion((v) => v + 1);
    // The shell's pending-reconciliation badge and the month floor are server-rendered.
    router.refresh();
  }, [router]);

  const lastOutlookRef = React.useRef<OutlookResponse | null>(null);
  const outlook = useMonthLoad<MonthOutlookLoad>(
    key,
    `${version}:${outlookNudge}`,
    async (signal) => {
      const data = await readJson<OutlookResponse>(
        `/api/month-outlook?year=${month.year}&month=${month.month}`,
        signal,
      );
      // Ages are measured from when the figures arrived, never from a render.
      setNowMs(Date.now());
      // A first sync driven elsewhere just ended: everything it imported is
      // new to the sections and the runs, as after a stream of our own.
      if (firstSyncRunEnded(lastOutlookRef.current, data)) refreshAll();
      lastOutlookRef.current = data;
      return { month, outlook: data };
    },
  );

  const sync = useSyncStream({
    // Every outcome re-reads: a run that dropped mid-way kept what it
    // imported, and a refused start means a run is live elsewhere, which the
    // outlook's progress (and its polling) shows.
    onSettled: refreshAll,
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
      .catch(() => {
        // Unknown, not "hide": freshness falls back to the outlook's own
        // staleness and onboarding to its balances; the next re-read retries.
        if (!controller.signal.aborted) setRuns((known) => known ?? []);
      });
    return () => controller.abort();
  }, [version]);

  const live = stream.starting || stream.syncing;
  const shown = outlook.data && nowMs !== null ? { ...outlook.data, nowMs } : null;
  const data = shown?.outlook ?? null;
  // The last known outlook decides, so a failed re-read never ends the watch.
  const firstSyncElsewhere = data?.state === "first-sync" && data.progress.running && !live;
  const runsRef = React.useRef(runs);
  React.useEffect(() => {
    runsRef.current = runs;
  });

  React.useEffect(() => {
    if (!firstSyncElsewhere) return;
    const controller = new AbortController();
    let seen = runsRef.current ? runsSignature(runsRef.current) : null;
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      const safety = ticks % FIRST_SYNC_SAFETY_TICKS === 0;
      readJson<SyncRunSummary[]>("/api/sync-runs", controller.signal)
        .then((next) => {
          const signature = runsSignature(next);
          if (signature === seen && !safety) return;
          seen = signature;
          setRuns(next);
          setOutlookNudge((n) => n + 1);
        })
        // A failed poll just waits for the next one.
        .catch(() => {
          if (safety && !controller.signal.aborted) setOutlookNudge((n) => n + 1);
        });
    }, FIRST_SYNC_POLL_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [firstSyncElsewhere]);

  const select = React.useCallback(
    (next: HomeMonth) => {
      if (!isBrowsable(next, range) || sameMonth(next, month)) return;
      window.history.pushState(null, "", homeHref(next, range.current));
    },
    [range, month],
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
        <MonthNav selected={month} range={range} onSelect={select} />
      </header>

      <MonthHero
        month={month}
        busy={outlook.pending && !outlook.current && !outlook.failed && shown !== null}
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
        {outlook.failed && !outlook.current ? (
          <HeroError retrying={outlook.pending} onRetry={() => setOutlookNudge((n) => n + 1)} />
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
          lastSyncRuns={runs}
          onMonthlyTargets={setTargets}
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
          knownTargets={targets}
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
