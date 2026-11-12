"use client";

import * as React from "react";
import Link from "next/link";
import { CaretLeftIcon, ClockIcon, RepeatIcon } from "@/components/icons";
import { Amount } from "@/components/ui/amount";
import { CADENCE_LABELS } from "@/components/cadence-labels";
import { toLocalDate } from "@/components/transactions/days";
import type { SectionLoad } from "./load";
import { Bone, ListCard, ListSkeletonRows, ROW, Section, SectionBody, SectionEmpty } from "./parts";
import {
  moreChargesLabel,
  relativeDayLabel,
  upcomingList,
  type UpcomingCharge,
  type UpcomingWhen,
} from "./view";

export type UpcomingForecast = { upcoming: UpcomingCharge[]; total: number };

const SHORT_DATE = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short" });

function dateLabel(iso: string): string {
  return SHORT_DATE.format(toLocalDate(iso));
}

const TOTAL_ROW = "bg-muted text-body flex min-h-11 items-center justify-between gap-3 px-4 py-2";

/** The hero's equation note says "שמאחרים להגיע"; keep the two worded alike. */
const LATE_LABEL = "מאחר להגיע";

function When({ when, date }: { when: UpcomingWhen; date: string }) {
  if (when.late) {
    return (
      <span className="text-attention-text inline-flex items-center gap-1 font-medium">
        <ClockIcon weight="fill" className="size-3.5" />
        {LATE_LABEL}
      </span>
    );
  }
  return <>{relativeDayLabel(when.inDays) ?? dateLabel(date)}</>;
}

/**
 * Live recurring series expected within the endpoint's horizon (earliest
 * first, late ones leading), from `/api/recurring-upcoming` as it answers:
 * amounts are its rolling averages, the total covers every listed series.
 * The total is the endpoint's own 31-day forecast, not the hero's recurring
 * still due this month; the two can differ (#353).
 */
export function UpcomingSection({
  load,
  today,
}: {
  load: SectionLoad<UpcomingForecast>;
  /** The home calendar day, live. */
  today: string;
}) {
  return (
    <Section title="חיובים קבועים קרובים" link={{ label: "מנויים", href: "/subscriptions" }}>
      <SectionBody
        load={load}
        what="החיובים הקרובים"
        skeleton={
          <ListCard>
            <ListSkeletonRows rows={3} />
            <li className={TOTAL_ROW}>
              <span className="text-body">
                <Bone className="w-24" />
              </span>
            </li>
          </ListCard>
        }
      >
        {(data) => <UpcomingList forecast={data} today={today} />}
      </SectionBody>
    </Section>
  );
}

function UpcomingList({ forecast, today }: { forecast: UpcomingForecast; today: string }) {
  if (forecast.upcoming.length === 0) {
    return (
      <SectionEmpty
        icon={<RepeatIcon weight="duotone" className="size-6" />}
        heading="אין חיובים קבועים צפויים"
        explainer="מנויים וחיובים שחוזרים כל חודש יופיעו כאן לפני שהם יורדים."
      />
    );
  }
  const { rows, hidden } = upcomingList(forecast.upcoming, today);
  return (
    <ListCard>
      {rows.map((charge) => (
        <li key={charge.id} className={ROW}>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body truncate font-medium">
              {charge.displayName ?? charge.merchant}
            </span>
            <span className="text-caption text-muted-foreground mt-0.5 truncate">
              {CADENCE_LABELS[charge.cadence]} ·{" "}
              <When when={charge.when} date={charge.projectedDate} />
            </span>
          </span>
          <Amount
            amount={charge.expectedAmount}
            colorize={false}
            fractionDigits={0}
            className="text-body shrink-0 font-semibold whitespace-nowrap"
          />
        </li>
      ))}
      {hidden > 0 && (
        <li>
          <Link
            href="/subscriptions"
            className="press text-body text-primary hover:bg-muted focus-visible:ring-ring/50 flex min-h-11 items-center justify-center gap-1 px-4 font-semibold outline-none focus-visible:ring-3 focus-visible:ring-inset"
          >
            {moreChargesLabel(hidden)}
            <CaretLeftIcon className="size-4" />
          </Link>
        </li>
      )}
      <li className={TOTAL_ROW}>
        <span className="text-muted-foreground">צפוי בחודש הקרוב</span>
        <Amount
          amount={forecast.total}
          colorize={false}
          fractionDigits={0}
          className="font-bold whitespace-nowrap"
        />
      </li>
    </ListCard>
  );
}
