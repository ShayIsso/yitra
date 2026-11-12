"use client";

import * as React from "react";
import Link from "next/link";
import { SectionError } from "@/components/reports/parts";
import { HEBREW_MONTHS, monthKey } from "@/components/reports/format";
import type { HomeTrends as HomeTrendsData } from "@/lib/reports/home-trends";
import { useMonthLoad } from "../month-load";
import { shiftMonth, type HomeMonth, type MonthRange } from "../month";
import { CategoryList, CategoryListSkeleton } from "./category-list";
import { StatTiles, StatTilesSkeleton } from "./stat-tiles";
import { comparisonLabel } from "./trends-view";
import { YearChart, YearChartSkeleton } from "./year-chart";

async function readTrends(month: HomeMonth, signal: AbortSignal): Promise<HomeTrendsData> {
  const res = await fetch(`/api/home-trends?year=${month.year}&month=${month.month}`, { signal });
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<HomeTrendsData>;
}

function Section({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex min-h-11 flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id={id} className="text-title font-semibold tracking-tight">
            {title}
          </h2>
          {description !== undefined && (
            <p className="text-body text-muted-foreground min-h-5">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function comparisonCaption(data: HomeTrendsData): string {
  const c = data.comparison;
  switch (c.state) {
    case "shown":
      return comparisonLabel(c);
    case "early":
      return `ההשוואה לחודש הקודם תופיע מה־${c.visibleFromDay} בחודש`;
    case "no-history":
      return "אין חודש קודם להשוואה";
  }
}

/**
 * The home screen's trend sections (#320): stat tiles, the ranked category
 * list and the twelve-month income-versus-expense chart, all from one
 * `/api/home-trends` read. It loads as soon as it mounts but draws nothing
 * until `visible`, like the sections after it. A refetch of the same month
 * (`refreshKey`: a sync settled, a target saved) keeps the figures on screen;
 * a month change shows the skeleton. Memoized: the home screen re-renders on
 * every clock tick and sync-stream frame.
 */
export const HomeTrends = React.memo(function HomeTrends({
  month,
  range,
  refreshKey,
  visible,
  onSelect,
}: {
  month: HomeMonth;
  range: MonthRange;
  refreshKey: string;
  visible: boolean;
  onSelect: (month: HomeMonth) => void;
}) {
  const [attempt, setAttempt] = React.useState(0);
  const load = useMonthLoad(monthKey(month), `${refreshKey}:${attempt}`, (signal) =>
    // A microtask later, so the hero's outlook request goes out first.
    Promise.resolve().then(() => readTrends(month, signal)),
  );
  const data = load.current ? load.data : null;
  const failed = data === null && load.failed;
  const retry = () => setAttempt((a) => a + 1);

  if (!visible) return null;

  const comparedTo = data?.comparison.state === "shown" ? comparisonLabel(data.comparison) : null;
  const previous = shiftMonth(month, -1);
  const running = month.year === range.current.year && month.month === range.current.month;

  return (
    <>
      <Section
        id="home-stats"
        title="המספרים של החודש"
        description={data ? comparisonCaption(data) : "\u00a0"}
      >
        {failed ? (
          <SectionError what="המספרים של החודש" onRetry={retry} />
        ) : data ? (
          <StatTiles
            totals={data.totals}
            months={data.months}
            selectedIndex={data.selectedIndex}
            comparison={data.comparison}
            comparedTo={comparedTo}
          />
        ) : (
          <StatTilesSkeleton />
        )}
      </Section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Section
          id="home-categories"
          title="לאן הלך הכסף"
          description="מדורג לפי הוצאה. קבוצה נפתחת לקטגוריות שלה."
          action={
            <Link
              href="/reports"
              className="text-body text-primary focus-visible:ring-ring/50 inline-flex min-h-11 items-center rounded-lg px-2 font-semibold outline-none hover:underline focus-visible:ring-3"
            >
              לדוחות
            </Link>
          }
        >
          {failed ? (
            <SectionError what="ההוצאות לפי קטגוריה" onRetry={retry} />
          ) : data ? (
            <CategoryList
              total={data.categories.total}
              rows={data.categories.rows}
              quiet={data.quiet}
              quietLabel={
                running
                  ? `ב${HEBREW_MONTHS[previous.month - 1]} היו הוצאות גם על אלה, החודש עוד לא:`
                  : `ב${HEBREW_MONTHS[previous.month - 1]} היו הוצאות גם על אלה, ב${HEBREW_MONTHS[month.month - 1]} לא:`
              }
              selectedIndex={data.selectedIndex}
              comparedTo={comparedTo}
            />
          ) : (
            <CategoryListSkeleton />
          )}
        </Section>

        <Section
          id="home-year"
          title="12 חודשים"
          description="נכנס מול יצא. בחירת חודש עוברת אליו."
        >
          {failed ? (
            <SectionError what="שנים־עשר החודשים" onRetry={retry} />
          ) : data ? (
            <YearChart
              months={data.months}
              selected={month}
              current={range.current}
              range={range}
              onSelect={onSelect}
            />
          ) : (
            <YearChartSkeleton />
          )}
        </Section>
      </div>
    </>
  );
});
