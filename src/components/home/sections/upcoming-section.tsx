"use client";

import * as React from "react";
import Link from "next/link";
import { CaretLeftIcon, ClockIcon, RepeatIcon } from "@/components/icons";
import { Amount } from "@/components/ui/amount";
import type { Cadence } from "@/lib/recurring-detection";
import type { SectionLoad } from "./load";
import { ListCard, ListSkeleton, ROW, Section, SectionBody, SectionEmpty } from "./parts";
import { upcomingList, type UpcomingCharge, type UpcomingWhen } from "./view";

export type UpcomingForecast = { upcoming: UpcomingCharge[]; total: number };

const CADENCE_LABEL: Record<Cadence, string> = {
  monthly: "חודשי",
  quarterly: "רבעוני",
  annual: "שנתי",
};

const SHORT_DATE = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short" });

function dateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return SHORT_DATE.format(new Date(y, m - 1, d));
}

/** The hero's word for it ("שמאחרים להגיע"), so the two never describe a late charge differently. */
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
  if (when.inDays === 0) return <>היום</>;
  if (when.inDays === 1) return <>מחר</>;
  if (when.inDays <= 7) return <>בעוד {when.inDays} ימים</>;
  return <>{dateLabel(date)}</>;
}

/**
 * Live recurring series expected within the endpoint's horizon (earliest
 * first, late ones leading), from `/api/recurring-upcoming` as it answers:
 * amounts are its rolling averages, the total covers every listed series.
 */
export function UpcomingSection({ load }: { load: SectionLoad<UpcomingForecast> }) {
  return (
    <Section title="חיובים קבועים קרובים" link={{ label: "מנויים", href: "/subscriptions" }}>
      <SectionBody load={load} what="החיובים הקרובים" skeleton={<ListSkeleton rows={3} />}>
        {(data, today) => <UpcomingList forecast={data} today={today} />}
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
              {CADENCE_LABEL[charge.cadence]} ·{" "}
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
            עוד {hidden} חיובים
            <CaretLeftIcon className="size-4" />
          </Link>
        </li>
      )}
      <li className="bg-muted text-body flex min-h-11 items-center justify-between gap-3 px-4 py-2">
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
