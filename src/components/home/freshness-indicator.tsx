"use client";

import Link from "next/link";
import { ArrowsClockwiseIcon, KeyIcon, WarningCircleIcon } from "@/components/icons";
import { bankLabel } from "@/lib/bank-registry";
import { cn } from "@/lib/utils";
import { formatRelativeAge } from "@/components/relative-age";
import type { Freshness } from "./freshness";

const PILL =
  "press text-body inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-hero-foreground/60";

/** Coral is attention only (ADR-0015): the stale, failed and code states, with ink text. */
const LOUD = "bg-attention text-attention-foreground font-medium";
const QUIET = "text-hero-muted hover:bg-hero-foreground/10 hover:text-hero-foreground";

export type FreshnessActions = {
  onSyncNow: () => void;
  /** Reopens the code prompt the live run is waiting on. */
  onEnterCode: () => void;
};

/**
 * The hero's sync-freshness indicator: quiet text when the data is fresh, a
 * coral pill with its one-tap action when it needs the owner. Every state is
 * worded, never told by colour alone.
 */
export function FreshnessIndicator({
  freshness,
  onSyncNow,
  onEnterCode,
}: { freshness: Freshness } & FreshnessActions) {
  switch (freshness.kind) {
    case "unknown":
      return null;
    case "fresh":
      return (
        <Link href="/sync" className={cn(PILL, QUIET)}>
          <ArrowsClockwiseIcon className="size-4" />
          {freshness.ageMs === null ? "סנכרון" : `עודכן ${formatRelativeAge(freshness.ageMs)}`}
        </Link>
      );
    case "syncing":
      return (
        <span role="status" className={cn(PILL, "text-hero-foreground")}>
          <ArrowsClockwiseIcon className="size-4" />
          מסנכרן...
        </span>
      );
    case "stale": {
      const age =
        freshness.ageMs === null
          ? "הנתונים לא עדכניים"
          : `עודכן ${formatRelativeAge(freshness.ageMs)}`;
      return (
        <button
          type="button"
          onClick={onSyncNow}
          aria-label={`${age}. לסנכרן עכשיו`}
          className={cn(PILL, LOUD)}
        >
          <WarningCircleIcon weight="fill" className="size-4" />
          {/* Below 380px the age would wrap the hero's title row; the as-of line still dates it. */}
          <span className="max-[379px]:hidden">
            {age}
            <span aria-hidden="true"> · </span>
          </span>
          <span className="font-semibold">לסנכרן</span>
        </button>
      );
    }
    case "failed":
      return (
        <Link href={`/sync?bank=${freshness.bank}`} className={cn(PILL, LOUD)}>
          <WarningCircleIcon weight="fill" className="size-4" />
          <span className="max-[379px]:hidden">{`הסנכרון של ${bankLabel(freshness.bank)} נכשל`}</span>
          <span className="min-[380px]:hidden">הסנכרון נכשל</span>
        </Link>
      );
    case "code-missed":
      return (
        <button
          type="button"
          onClick={onSyncNow}
          aria-label="נדרש קוד אימות. לסנכרן עכשיו"
          className={cn(PILL, LOUD)}
        >
          <KeyIcon className="size-4" />
          <span>נדרש קוד</span>
          <span className="max-[379px]:hidden">
            <span aria-hidden="true"> · </span>
            <span className="font-semibold">לסנכרן</span>
          </span>
        </button>
      );
    case "code-needed":
      return (
        <button type="button" onClick={onEnterCode} className={cn(PILL, LOUD)}>
          <KeyIcon className="size-4" />
          <span className="font-semibold">הזנת קוד אימות</span>
        </button>
      );
  }
}
