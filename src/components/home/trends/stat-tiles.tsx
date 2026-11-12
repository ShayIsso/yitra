"use client";

import * as React from "react";
import {
  ArrowCircleDownIcon,
  ArrowCircleUpIcon,
  ChartLineUpIcon,
  PercentIcon,
  PiggyBankIcon,
} from "@/components/icons";
import { Amount } from "@/components/ui/amount";
import { formatPercent } from "@/components/reports/format";
import { cn } from "@/lib/utils";
import type {
  HomeTrendComparison,
  HomeTrendPoint,
  HomeTrendTotals,
} from "@/lib/reports/home-trends";
import { ChangeChip } from "./change-chip";
import { Sparkline } from "./sparkline";
import { changeView, rateChangeView, type ChangeView, type GoodDirection } from "./trends-view";

type MoneyKey = "income" | "expenses" | "netSavings" | "investment";

type Tile = {
  key: MoneyKey | "savingsRate";
  label: string;
  icon: React.ComponentType<{ className?: string; weight?: "duotone" }>;
  good: GoodDirection;
};

/** Investment is the deployment of savings (CLAUDE.md "Financial Metrics"): its moves are not judged. */
const TILES: Tile[] = [
  { key: "income", label: "הכנסות", icon: ArrowCircleDownIcon, good: "up" },
  { key: "expenses", label: "הוצאות", icon: ArrowCircleUpIcon, good: "down" },
  { key: "netSavings", label: "חיסכון נטו", icon: PiggyBankIcon, good: "up" },
  { key: "savingsRate", label: "אחוז חיסכון", icon: PercentIcon, good: "up" },
  { key: "investment", label: "השקעות", icon: ChartLineUpIcon, good: "neutral" },
];

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5";
const TILE =
  "bg-card flex min-w-0 flex-col gap-1.5 rounded-xl border border-[color:var(--card-border)] p-4 shadow-[var(--card-shadow)]";
/** The fifth tile spans the row on a two-column phone grid, so no tile sits alone. */
const LAST_WIDE = "col-span-2 sm:col-span-1";

function TileHead({ tile }: { tile: Tile }) {
  return (
    <h3 className="text-body text-muted-foreground flex items-center gap-2 font-medium">
      <tile.icon weight="duotone" className="text-primary size-5 shrink-0" />
      {tile.label}
    </h3>
  );
}

function rateExplainer(totals: HomeTrendTotals): string {
  return totals.income <= 0 ? "אין הכנסה בחודש" : "לא בר השוואה החודש";
}

function TileValue({ tile, totals }: { tile: Tile; totals: HomeTrendTotals }) {
  if (tile.key === "savingsRate") {
    return totals.savingsRate === null ? (
      // The explainer under it says why, in words.
      <span aria-hidden>—</span>
    ) : (
      <span className="tabular-nums">{formatPercent(totals.savingsRate)}</span>
    );
  }
  const amount = totals[tile.key];
  return (
    <Amount
      amount={amount}
      fractionDigits={0}
      figure
      // Net savings is the one money figure here whose sign is the news; the
      // minus sign carries it alongside the colour.
      colorize={tile.key === "netSavings"}
    />
  );
}

function tileChange(tile: Tile, comparison: HomeTrendComparison): ChangeView | null {
  if (comparison.state !== "shown") return null;
  if (tile.key === "savingsRate") {
    return comparison.savingsRate === null ? null : rateChangeView(comparison.savingsRate);
  }
  return changeView(comparison[tile.key], tile.good);
}

/**
 * The month's five headline figures (#320), each with its change against the
 * month before and a twelve-month sparkline. The comparison's wording sits once
 * in the section header; a tile shows only its chip.
 */
export function StatTiles({
  totals,
  months,
  selectedIndex,
  comparison,
  comparedTo,
}: {
  totals: HomeTrendTotals;
  months: HomeTrendPoint[];
  selectedIndex: number;
  comparison: HomeTrendComparison;
  /** The comparison in words, for screen readers; null when there is none. */
  comparedTo: string | null;
}) {
  return (
    <ul className={GRID}>
      {TILES.map((tile, i) => {
        const change = tileChange(tile, comparison);
        // A month with no rows is unknown, not ₪0: the line breaks there.
        const series = months.map((m) => (m.hasData ? m[tile.key] : null));
        return (
          <li key={tile.key} className={cn(TILE, i === TILES.length - 1 && LAST_WIDE)}>
            <TileHead tile={tile} />
            <p className="text-title font-extrabold tracking-tight">
              <TileValue tile={tile} totals={totals} />
            </p>
            <p className="text-caption text-muted-foreground flex min-h-5 items-center">
              {tile.key === "savingsRate" && totals.savingsRate === null ? (
                rateExplainer(totals)
              ) : tile.key === "investment" && totals.investment < 0 ? (
                "משיכה נטו מהשקעות"
              ) : change && comparedTo ? (
                <ChangeChip view={change} comparedTo={comparedTo} />
              ) : null}
            </p>
            <Sparkline values={series} highlight={selectedIndex} className="mt-auto h-8 w-full" />
          </li>
        );
      })}
    </ul>
  );
}

function Bone({ className }: { className: string }) {
  return <span className={cn("bg-muted inline-block animate-pulse rounded-lg", className)} />;
}

/** Same tiles, same rows, so the swap to figures shifts nothing. */
export function StatTilesSkeleton() {
  return (
    <ul aria-hidden className={GRID}>
      {TILES.map((tile, i) => (
        <li key={tile.key} className={cn(TILE, i === TILES.length - 1 && LAST_WIDE)}>
          <TileHead tile={tile} />
          <p className="text-title">
            <Bone className="h-6 w-24 align-middle" />
          </p>
          <p className="text-caption flex min-h-5 items-center">
            <Bone className="h-3 w-14" />
          </p>
          <Bone className="mt-auto h-8 w-full" />
        </li>
      ))}
    </ul>
  );
}
