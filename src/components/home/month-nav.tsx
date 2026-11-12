"use client";

import { CaretLeftIcon, CaretRightIcon } from "@/components/icons";
import { HEBREW_MONTHS_SHORT, monthLabel } from "@/components/reports/format";
import { cn } from "@/lib/utils";
import {
  compareMonths,
  isBrowsable,
  monthWindow,
  sameMonth,
  shiftMonth,
  type HomeMonth,
  type MonthRange,
} from "./month";

const CHEVRON =
  "press grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 outline-none disabled:pointer-events-none disabled:opacity-40";

/**
 * Month navigation: a segmented control between two chevrons. Months run
 * oldest to newest in reading order, so in RTL the newest sits at the inline
 * end (left): "earlier" is the right-hand chevron pointing right, "later" the
 * left-hand one pointing left, matching the hero's swipe. Only months in
 * `range` are offered: none that hasn't started, none before the first data.
 */
export function MonthNav({
  selected,
  range,
  onSelect,
}: {
  selected: HomeMonth;
  range: MonthRange;
  onSelect: (month: HomeMonth) => void;
}) {
  const { current } = range;
  const atNewest = compareMonths(selected, current) >= 0;
  const atOldest = compareMonths(selected, range.first) <= 0;
  return (
    <nav aria-label="בחירת חודש" className="flex items-center gap-1">
      <button
        type="button"
        className={CHEVRON}
        aria-label="חודש קודם"
        disabled={atOldest}
        onClick={() => onSelect(shiftMonth(selected, -1))}
      >
        <CaretRightIcon className="size-5" />
      </button>
      <ul className="bg-muted flex min-w-0 flex-1 items-center rounded-full p-1 md:flex-none">
        {monthWindow(selected, range).map((m) => {
          const active = sameMonth(m, selected);
          const otherYear = m.year !== current.year;
          return (
            <li key={`${m.year}-${m.month}`} className="min-w-0 flex-1 md:flex-none">
              <button
                type="button"
                aria-current={active ? "date" : undefined}
                aria-label={monthLabel(m)}
                disabled={!isBrowsable(m, range)}
                onClick={() => onSelect(m)}
                className={cn(
                  "press text-body focus-visible:ring-ring/50 flex h-11 w-full min-w-11 flex-col items-center justify-center rounded-full px-1 leading-none font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 md:w-16",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
                )}
              >
                {HEBREW_MONTHS_SHORT[m.month - 1]}
                {otherYear && (
                  <span className="text-caption mt-0.5 leading-none tabular-nums opacity-80">
                    {m.year}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className={CHEVRON}
        aria-label="חודש הבא"
        disabled={atNewest}
        onClick={() => onSelect(shiftMonth(selected, 1))}
      >
        <CaretLeftIcon className="size-5" />
      </button>
    </nav>
  );
}
