"use client";

import * as React from "react";
import { ArrowsClockwiseIcon, WarningCircleIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { monthLabel } from "@/components/reports/format";
import { swipeStep, type HomeMonth } from "./month";

/**
 * The home hero's frame (ADR-0015 "Hero"): the dark teal surface with its
 * sheen and grain, the month title, the freshness indicator and a body. A
 * horizontal swipe on it steps the month the same way the chevrons do.
 * `busy` dims the previous month's body while the next one loads.
 */
export function MonthHero({
  month,
  indicator,
  busy = false,
  onStep,
  children,
}: {
  month: HomeMonth;
  indicator?: React.ReactNode;
  busy?: boolean;
  onStep: (delta: -1 | 1) => void;
  children: React.ReactNode;
}) {
  const titleId = React.useId();
  const start = React.useRef<{ x: number; y: number } | null>(null);

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={busy || undefined}
      onPointerDown={(e) => {
        // Touch and pen only: a mouse drag on desktop selects text.
        start.current = e.pointerType === "mouse" ? null : { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const from = start.current;
        start.current = null;
        if (!from) return;
        const step = swipeStep(e.clientX - from.x, e.clientY - from.y);
        if (step !== 0) onStep(step);
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
      className="bg-hero text-hero-foreground relative isolate touch-pan-y overflow-hidden rounded-xl"
    >
      <div
        aria-hidden="true"
        className="from-hero-foreground/10 pointer-events-none absolute inset-0 -z-10 bg-radial-[120%_80%_at_100%_0%] to-transparent to-60%"
      />
      <div aria-hidden="true" className="hero-grain pointer-events-none absolute inset-0 -z-10" />
      <div className="flex flex-col gap-4 p-5 sm:p-7 lg:p-8">
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 id={titleId} className="text-lead font-semibold">
            {monthLabel(month)}
          </h2>
          {indicator}
        </div>
        <div className={cn("transition-opacity duration-150", busy && "opacity-60")}>
          {children}
        </div>
      </div>
    </section>
  );
}

/** A text-height placeholder: an nbsp in the real type step, so the line box matches exactly. */
function Bone({ className }: { className: string }) {
  return (
    <span className={cn("bg-hero-foreground/10 inline-block animate-pulse rounded-lg", className)}>
      &nbsp;
    </span>
  );
}

/**
 * The active state's shape (label, figure, per-day line, as-of line, the
 * equation toggle), line for line in the same type steps, so the swap to
 * content moves nothing below the hero.
 */
export function HeroBodySkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col">
      <div className="text-lead flex min-h-7 items-center">
        <Bone className="w-32" />
      </div>
      <p className="text-display mt-2">
        <Bone className="w-56 max-w-full" />
      </p>
      <p className="text-lead mt-3">
        <Bone className="w-44" />
      </p>
      <p className="text-body mt-1">
        <Bone className="w-52" />
      </p>
      <div className="mt-3 flex min-h-11 items-center">
        <Bone className="text-body w-28" />
      </div>
    </div>
  );
}

/** The hero's own load failure: calm, inside the hero, with a retry for this section only. */
export function HeroError({ retrying, onRetry }: { retrying: boolean; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-4">
      <div className="flex items-start gap-3">
        <WarningCircleIcon weight="fill" className="mt-0.5 size-5 shrink-0" />
        <div className="flex flex-col gap-1">
          <p className="text-lead font-medium">לא הצלחנו לטעון את תמונת החודש</p>
          <p className="text-hero-muted text-body">ייתכן שזו תקלה זמנית. שאר המסך לא נפגע.</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="press bg-hero-foreground/10 text-hero-foreground text-body hover:bg-hero-foreground/15 focus-visible:ring-hero-foreground/60 inline-flex min-h-11 items-center gap-2 rounded-lg px-4 font-medium outline-none focus-visible:ring-3 disabled:opacity-60"
      >
        <ArrowsClockwiseIcon className="size-4" />
        {retrying ? "טוען..." : "נסה שוב"}
      </button>
    </div>
  );
}
