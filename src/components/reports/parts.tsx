"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowsClockwiseIcon,
  WarningCircleIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { computeYoyDelta } from "@/lib/reports/yoy";
import { cn } from "@/lib/utils";
import { formatPointsDelta, formatSignedPercent } from "./format";

/** A section of the page: an h2 title, an optional control at its end, then its body. */
export function ReportSection({
  id,
  title,
  description,
  action,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id={id} className="text-title font-semibold tracking-tight">
            {title}
          </h2>
          {description && <p className="text-body text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Category identity: a small filled dot, never a fill on a bar or text (ADR-0015). */
export function CategoryDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

export type GoodDirection = "up" | "down" | "neutral";

/** A change already worded by its caller: which way it moved and its signed label. */
export type DeltaView = { direction: "up" | "down" | "flat"; label: string };

/**
 * A change against a comparison period. Direction is carried by an arrow and a
 * sign, whether it is good by colour on top (never colour alone, ADR-0015), and
 * screen readers hear the verdict in words. A zero or absent base prints "—":
 * never a fabricated ∞% (computeYoyDelta). A caller that words the change
 * itself (the home trends, whose changes the server computed) passes `change`.
 */
export function DeltaChip({
  good,
  comparedTo,
  className,
  ...figures
}: {
  good: GoodDirection;
  /** Named comparison for screen readers, e.g. "אשתקד". */
  comparedTo: string;
  className?: string;
} & (
  | {
      current: number;
      previous: number | null;
      /** Savings rate: the change is stated in percentage points, not relative percent. */
      points?: boolean;
    }
  | { change: DeltaView }
)) {
  let view: DeltaView;
  if ("change" in figures) {
    view = figures.change;
  } else {
    const { current, previous, points = false } = figures;
    const delta = computeYoyDelta(current, previous);
    if (delta.pct === null) {
      return (
        <span className={cn("text-muted-foreground text-caption", className)}>
          <span aria-hidden>—</span>
          <span className="sr-only">אין נתון להשוואה מול {comparedTo}</span>
        </span>
      );
    }
    view = {
      direction: delta.direction,
      label:
        delta.direction === "flat"
          ? "ללא שינוי"
          : points
            ? formatPointsDelta(current - (previous ?? 0))
            : formatSignedPercent(delta.pct),
    };
  }
  const verdict =
    view.direction === "flat" || good === "neutral"
      ? null
      : view.direction === good
        ? "good"
        : "bad";
  const Arrow = view.direction === "up" ? ArrowUpIcon : ArrowDownIcon;
  return (
    <span
      className={cn(
        "text-caption inline-flex items-center gap-0.5 font-semibold whitespace-nowrap tabular-nums",
        verdict === "good" ? "text-pos" : verdict === "bad" ? "text-neg" : "text-muted-foreground",
        className,
      )}
    >
      {view.direction !== "flat" && <Arrow className="size-3.5" />}
      <span>{view.label}</span>
      <span className="sr-only">
        {" "}
        מול {comparedTo}
        {verdict === "good" ? ", לטובה" : verdict === "bad" ? ", לרעה" : ""}
      </span>
    </span>
  );
}

/** A designed empty state for a whole view or section. */
export function ReportsEmpty({
  icon: Icon,
  title,
  body,
  cta,
}: {
  icon: React.ComponentType<{ className?: string; weight?: "duotone" }>;
  title: string;
  body: string;
  cta?: { label: string; href: string };
}) {
  return (
    <div className="bg-card flex flex-col items-center rounded-xl border border-[color:var(--card-border)] px-6 py-12 text-center shadow-[var(--card-shadow)]">
      <span className="bg-muted text-primary mb-4 grid size-14 place-items-center rounded-full">
        <Icon weight="duotone" className="size-7" />
      </span>
      <p className="text-lead font-semibold">{title}</p>
      <p className="text-body text-muted-foreground mt-1 max-w-sm">{body}</p>
      {cta && (
        <Button
          className="mt-5 h-11 px-5 md:h-9"
          nativeButton={false}
          render={<Link href={cta.href} />}
        >
          {cta.label}
        </Button>
      )}
    </div>
  );
}

/** A calm inline failure for one section only, with a retry that refetches just that section. */
export function SectionError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="bg-card flex flex-col items-start gap-3 rounded-xl border border-[color:var(--card-border)] p-4 shadow-[var(--card-shadow)] sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-body flex items-center gap-2">
        <WarningCircleIcon weight="fill" className="text-attention-text size-5 shrink-0" />
        לא הצלחנו לטעון את {what}.
      </p>
      <Button variant="outline" className="h-11 gap-1.5 md:h-9" onClick={onRetry}>
        <ArrowsClockwiseIcon className="size-4" />
        נסה שוב
      </Button>
    </div>
  );
}

/** A two-option segmented control; each option is a full 44px tap target on phones. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("bg-muted flex rounded-lg p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "text-body focus-visible:ring-ring/50 h-11 flex-1 rounded-lg px-4 font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 md:h-8",
            value === o.value
              ? "bg-card text-foreground shadow-[var(--card-shadow)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
