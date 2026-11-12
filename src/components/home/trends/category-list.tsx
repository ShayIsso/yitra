"use client";

import * as React from "react";
import { CaretDownIcon, CaretLeftIcon, ChartPieSliceIcon } from "@/components/icons";
import { Amount } from "@/components/ui/amount";
import { CategoryDot } from "@/components/reports/parts";
import { formatPercent } from "@/components/reports/format";
import { cn } from "@/lib/utils";
import type { HomeCategoryTrend, QuietCategory } from "@/lib/reports/home-trends";
import { ChangeChip } from "./change-chip";
import { Sparkline } from "./sparkline";
import { categoryChangeView } from "./trends-view";

/** Rows shown before "more"; the skeleton draws the same number. */
const CATEGORY_ROWS_VISIBLE = 6;

const CARD =
  "bg-card overflow-hidden rounded-xl border border-[color:var(--card-border)] shadow-[var(--card-shadow)]";
const ROW = "flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-start";

function CategoryRow({
  row,
  selectedIndex,
  comparedTo,
  child = false,
}: {
  row: HomeCategoryTrend;
  selectedIndex: number;
  comparedTo: string | null;
  child?: boolean;
}) {
  return (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex min-w-0 items-center gap-2">
          <CategoryDot color={row.color} />
          <span className={cn("truncate font-semibold", child ? "text-caption" : "text-body")}>
            {row.name}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="bg-muted relative h-1.5 flex-1 overflow-hidden rounded-full">
            <span
              className="bg-bar-strong absolute inset-y-0 start-0 rounded-full"
              style={{ width: `${Math.max(row.share * 100, 1)}%` }}
            />
          </span>
          <span className="text-caption text-muted-foreground w-9 shrink-0 tabular-nums">
            {formatPercent(row.share * 100)}
          </span>
        </span>
      </span>
      <Sparkline
        values={row.series}
        highlight={selectedIndex}
        className="h-6 w-12 shrink-0 sm:w-16"
      />
      <span className="flex w-[5.5rem] shrink-0 flex-col items-end gap-0.5">
        <Amount
          amount={row.amount}
          fractionDigits={0}
          colorize={false}
          className={cn("font-bold", child ? "text-caption" : "text-body")}
        />
        {row.change && comparedTo && (
          <ChangeChip view={categoryChangeView(row.change)} comparedTo={comparedTo} />
        )}
      </span>
    </>
  );
}

function GroupRow({
  row,
  selectedIndex,
  comparedTo,
}: {
  row: HomeCategoryTrend;
  selectedIndex: number;
  comparedTo: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const childrenId = React.useId();
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={childrenId}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          ROW,
          "hover:bg-muted/60 focus-visible:ring-ring/50 outline-none focus-visible:ring-3",
        )}
      >
        {open ? (
          <CaretDownIcon className="text-muted-foreground size-4 shrink-0" />
        ) : (
          <CaretLeftIcon className="text-muted-foreground size-4 shrink-0" />
        )}
        <CategoryRow row={row} selectedIndex={selectedIndex} comparedTo={comparedTo} />
      </button>
      <ul id={childrenId} hidden={!open} className="ps-7">
        {row.children.map((c) => (
          <li key={c.categoryId} className={ROW}>
            <CategoryRow row={c} selectedIndex={selectedIndex} comparedTo={comparedTo} child />
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * Where the month's money went (#320): top-level categories ranked by spend
 * under the spend floor, each with its share of the by-category sum, a
 * twelve-month sparkline and its change against the month before. Groups
 * expand to their leaves. Category colour appears only as a dot.
 */
export function CategoryList({
  total,
  rows,
  quiet,
  quietLabel,
  selectedIndex,
  comparedTo,
}: {
  total: number;
  rows: HomeCategoryTrend[];
  quiet: QuietCategory[];
  /** Introduces the quiet categories, naming the month they spent in. */
  quietLabel: string;
  selectedIndex: number;
  comparedTo: string | null;
}) {
  const [all, setAll] = React.useState(false);
  const shown = all ? rows : rows.slice(0, CATEGORY_ROWS_VISIBLE);
  return (
    <div className={CARD}>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <span className="bg-muted text-primary grid size-12 place-items-center rounded-full">
            <ChartPieSliceIcon className="size-6" />
          </span>
          <p className="text-lead font-semibold">עוד אין הוצאות בחודש הזה</p>
          <p className="text-body text-muted-foreground max-w-xs">
            הוצאות מסווגות יופיעו כאן אחרי הסנכרון הבא.
          </p>
        </div>
      ) : (
        <>
          <p className="text-body text-muted-foreground flex items-baseline justify-between gap-3 px-4 pt-4 pb-1">
            <span>סך לפי קטגוריות</span>
            <Amount
              amount={total}
              fractionDigits={0}
              colorize={false}
              className="text-foreground font-bold"
            />
          </p>
          <ul className="p-1.5">
            {shown.map((row) =>
              row.children.length > 0 ? (
                <GroupRow
                  key={row.categoryId}
                  row={row}
                  selectedIndex={selectedIndex}
                  comparedTo={comparedTo}
                />
              ) : (
                <li key={row.categoryId} className={cn(ROW, "ps-10")}>
                  <CategoryRow row={row} selectedIndex={selectedIndex} comparedTo={comparedTo} />
                </li>
              ),
            )}
          </ul>
          {rows.length > CATEGORY_ROWS_VISIBLE && (
            <button
              type="button"
              aria-expanded={all}
              onClick={() => setAll((a) => !a)}
              className="text-body text-primary hover:bg-muted/60 focus-visible:ring-ring/50 flex min-h-11 w-full items-center justify-center gap-1 border-t font-semibold outline-none focus-visible:ring-3"
            >
              {all ? "פחות קטגוריות" : `עוד ${rows.length - CATEGORY_ROWS_VISIBLE} קטגוריות`}
              <CaretDownIcon className={cn("size-4", all && "rotate-180")} />
            </button>
          )}
        </>
      )}
      {quiet.length > 0 && (
        <div className="bg-muted/50 border-t px-4 py-3">
          <p className="text-body text-muted-foreground mb-2">{quietLabel}</p>
          <ul className="flex flex-wrap gap-1.5">
            {quiet.map((q) => (
              <li
                key={q.categoryId}
                className="bg-card text-body flex items-center gap-1.5 rounded-full border border-[color:var(--card-border)] py-1 ps-2.5 pe-3"
              >
                <CategoryDot color={q.color} />
                {q.name}
                <Amount
                  amount={q.previous}
                  fractionDigits={0}
                  colorize={false}
                  className="text-muted-foreground"
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The card with the same rows the list draws first, so the swap shifts nothing. */
export function CategoryListSkeleton() {
  return (
    <div aria-hidden className={CARD}>
      <p className="text-body flex items-baseline justify-between gap-3 px-4 pt-4 pb-1">
        <span className="bg-muted inline-block h-4 w-28 animate-pulse rounded-lg" />
        <span className="bg-muted inline-block h-4 w-16 animate-pulse rounded-lg" />
      </p>
      <ul className="p-1.5">
        {Array.from({ length: CATEGORY_ROWS_VISIBLE }, (_, i) => (
          <li key={i} className={cn(ROW, "ps-10")}>
            <span className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="bg-muted h-4 w-24 animate-pulse rounded-lg" />
              <span className="bg-muted h-1.5 w-full animate-pulse rounded-full" />
            </span>
            <span className="bg-muted h-6 w-12 shrink-0 animate-pulse rounded-lg sm:w-16" />
            <span className="bg-muted h-4 w-[5.5rem] shrink-0 animate-pulse rounded-lg" />
          </li>
        ))}
      </ul>
    </div>
  );
}
