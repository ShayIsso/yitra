"use client";

import {
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  ClockIcon,
  KeyIcon,
  PauseIcon,
  WarningCircleIcon,
} from "@/components/icons";
import type { BankStatusIcon, BankStatusTone, BankStatusView } from "@/components/bank-status-view";
import { cn } from "@/lib/utils";

// One institution's sync status, shared by the Sync page and the wizard.

const TONE_CLASS: Record<BankStatusTone, string> = {
  waiting: "text-muted-foreground",
  running: "text-foreground",
  done: "text-foreground font-medium",
  attention: "text-attention-text font-medium",
  quiet: "text-muted-foreground",
};

function StatusGlyph({ icon }: { icon: BankStatusIcon }) {
  const className = "size-4 shrink-0";
  switch (icon) {
    case "clock":
      return <ClockIcon weight="fill" className={className} />;
    case "sync":
      return <ArrowsClockwiseIcon className={className} />;
    case "check":
      return <CheckCircleIcon weight="fill" className={className} />;
    case "warning":
      return <WarningCircleIcon weight="fill" className={className} />;
    case "key":
      return <KeyIcon className={className} />;
    case "pause":
      return <PauseIcon weight="fill" className={className} />;
    case "dot":
      return (
        <span aria-hidden="true" className="grid size-4 shrink-0 place-items-center">
          <span className="bg-muted-foreground size-2 rounded-full" />
        </span>
      );
  }
}

/**
 * One institution's status as an icon beside words (see `bank-status-view.ts`).
 * Success glyphs stay in the text colour: `pos`/`neg` are for money only.
 * Only states that ask something of the owner are announced: a live region on
 * every row would read out every stage of every run.
 */
export function BankStatus({ view, className }: { view: BankStatusView; className?: string }) {
  return (
    <span
      role={view.alert ? "alert" : undefined}
      data-tone={view.tone}
      className={cn("text-body flex items-center gap-1.5", TONE_CLASS[view.tone], className)}
    >
      <StatusGlyph icon={view.icon} />
      <span className="min-w-0">{view.label}</span>
    </span>
  );
}

export function BankStatusDetail({ view }: { view: BankStatusView }) {
  if (!view.detail) return null;
  return <p className="bg-muted text-body rounded-lg px-3 py-2 break-words">{view.detail}</p>;
}

/**
 * A determinate bar, filled from the inline start. `fillClassName` overrides
 * the fill (colour, or `transition-none` for a bar that should only step).
 * Decorative: the words beside it carry the state.
 */
export function StageProgress({
  value,
  fillClassName,
}: {
  value: number | null;
  fillClassName?: string;
}) {
  if (value === null) return null;
  return (
    <div aria-hidden="true" className="bg-muted h-1.5 overflow-hidden rounded-full">
      <div
        className={cn(
          // transform-origin has no logical form, hence the rtl: override.
          "bg-bar-strong h-full origin-left rounded-full transition-transform duration-500 ease-out motion-reduce:transition-none rtl:origin-right",
          fillClassName,
        )}
        style={{ transform: `scaleX(${value})` }}
      />
    </div>
  );
}

export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
