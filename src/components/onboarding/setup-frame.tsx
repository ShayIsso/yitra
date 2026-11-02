"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { CheckIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { SETUP_STEPS, type SetupStep } from "@/lib/onboarding/steps";
import { EntryBrand, EntryFrame, EntryHeading } from "./entry-frame";
import { STEP_META } from "./step-meta";

type StepStatus = "done" | "current" | "upcoming";

function statusOf(step: SetupStep, current: SetupStep, passwordDone: boolean): StepStatus {
  if (step === current) return "current";
  if (step === "password" && passwordDone) return "done";
  return SETUP_STEPS.indexOf(step) < SETUP_STEPS.indexOf(current) ? "done" : "upcoming";
}

export type SetupFrameProps = {
  readonly step: SetupStep;
  readonly passwordDone: boolean;
  /** Where "continue later" leads; `null` while no session exists yet (the password step). */
  readonly exitHref: string | null;
  readonly children: React.ReactNode;
};

/**
 * The wizard's frame: the entry screens' hero pane carries the brand and a
 * vertical step rail on desktop, and collapses on a phone to a band with a
 * segmented progress bar above the step body.
 */
export function SetupFrame({ step, passwordDone, exitHref, children }: SetupFrameProps) {
  const meta = STEP_META[step];
  const position = SETUP_STEPS.indexOf(step) + 1;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);

  // A step change is a client navigation that unmounts the button that caused
  // it, which would drop focus to the document; the new step's title takes it.
  // Compared against the previous step rather than a mounted flag: StrictMode
  // runs the effect twice on mount, and a flag would then steal the first
  // load's autofocus from the password field.
  useEffect(() => {
    if (previousStep.current !== step) titleRef.current?.focus();
    previousStep.current = step;
  }, [step]);

  const hero = (
    <>
      <div className="flex items-center justify-between gap-2">
        <EntryBrand />
        <div className="flex items-center md:hidden">
          <FrameTools exitHref={exitHref} compact />
        </div>
      </div>

      <div aria-hidden="true" className="flex gap-1.5 md:hidden">
        {SETUP_STEPS.map((s, i) => (
          <span
            key={s}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i < position ? "bg-hero-foreground" : "bg-hero-foreground/25",
            )}
          />
        ))}
      </div>

      <ol className="hidden flex-col gap-1 md:flex" aria-label="שלבי ההגדרה">
        {SETUP_STEPS.map((s, i) => {
          const status = statusOf(s, step, passwordDone);
          return (
            <li
              key={s}
              aria-current={status === "current" ? "step" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-2",
                status === "current" && "bg-hero-foreground/10",
              )}
            >
              <StepMarker index={i} status={status} />
              <span
                className={cn(
                  "text-body",
                  status === "current" ? "text-hero-foreground font-medium" : "text-hero-muted",
                )}
              >
                {STEP_META[s].label}
                {status === "done" && <span className="sr-only"> (הושלם)</span>}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-auto hidden md:block">
        <FrameTools exitHref={exitHref} />
      </div>
    </>
  );

  return (
    <EntryFrame hero={hero}>
      <section key={step} className="enter flex flex-1 flex-col gap-6">
        <EntryHeading
          eyebrow={`שלב ${position} מתוך ${SETUP_STEPS.length}`}
          title={meta.title}
          description={meta.description}
          titleRef={titleRef}
        />
        <div className="flex flex-1 flex-col *:flex-1">{children}</div>
      </section>
    </EntryFrame>
  );
}

const HERO_CONTROL =
  "text-hero-muted hover:bg-hero-foreground/10 hover:text-hero-foreground focus-visible:ring-hero-foreground/60 min-h-11 rounded-lg outline-none focus-visible:ring-2";

function FrameTools({ exitHref, compact = false }: { exitHref: string | null; compact?: boolean }) {
  return (
    <div className={cn("flex gap-1", compact ? "items-center" : "flex-col")}>
      {exitHref && (
        <Link
          href={exitHref}
          className={cn(
            HERO_CONTROL,
            "text-body flex items-center px-3 font-medium whitespace-nowrap",
            compact && "px-2",
          )}
        >
          להמשיך מאוחר יותר
        </Link>
      )}
      <ThemeToggle
        className={cn(
          HERO_CONTROL,
          "whitespace-nowrap",
          compact && "w-11 justify-center px-0 [&>span]:sr-only",
        )}
      />
    </div>
  );
}

function StepMarker({ index, status }: { index: number; status: StepStatus }) {
  return (
    <span
      className={cn(
        "text-caption flex size-7 shrink-0 items-center justify-center rounded-full font-semibold tabular-nums",
        status === "done" && "bg-hero-foreground text-hero",
        status === "current" && "border-hero-foreground text-hero-foreground border-2",
        status === "upcoming" && "border-hero-muted/50 text-hero-muted border",
      )}
    >
      {status === "done" ? <CheckIcon className="size-3.5" /> : index + 1}
    </span>
  );
}
