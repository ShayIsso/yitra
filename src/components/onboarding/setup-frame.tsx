"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SETUP_STEPS, type SetupStep } from "@/lib/onboarding/steps";
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
 * The wizard's frame, picked at the #258 prototype gate: a two-pane card with
 * a vertical step rail on desktop, collapsing on mobile to a step count and a
 * progress bar above the step body.
 */
export function SetupFrame({ step, passwordDone, exitHref, children }: SetupFrameProps) {
  const meta = STEP_META[step];
  const position = SETUP_STEPS.indexOf(step) + 1;

  return (
    <div className="flex min-h-full flex-1 items-start justify-center px-4 py-6 md:items-center md:py-10">
      <Card className="w-full max-w-4xl min-w-0 gap-0 py-0 md:flex-row">
        <aside className="bg-muted/50 border-border flex flex-col gap-6 border-b p-5 md:w-64 md:border-e md:border-b-0 md:p-6">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-base font-semibold">
              <BrandMark className="h-5 w-auto" />
              Yitra
            </span>
            <span
              aria-hidden="true"
              className="text-muted-foreground text-xs font-medium tabular-nums md:hidden"
            >
              {position}/{SETUP_STEPS.length}
            </span>
          </div>

          <div aria-hidden="true" className="bg-border h-1 overflow-hidden rounded-full md:hidden">
            <div
              className="bg-foreground/70 h-full rounded-full"
              style={{ width: `${(position / SETUP_STEPS.length) * 100}%` }}
            />
          </div>

          <ol className="hidden flex-col gap-1 md:flex" aria-label="שלבי ההגדרה">
            {SETUP_STEPS.map((s, i) => {
              const status = statusOf(s, step, passwordDone);
              return (
                <li
                  key={s}
                  aria-current={status === "current" ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-2 py-2",
                    status === "current" && "bg-card",
                  )}
                >
                  <StepMarker index={i} status={status} />
                  <span
                    className={cn(
                      "text-sm",
                      status === "current"
                        ? "text-foreground font-medium"
                        : "text-muted-foreground",
                    )}
                  >
                    {STEP_META[s].label}
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="mt-auto hidden md:block">
            <FrameTools exitHref={exitHref} stacked />
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col gap-6 p-5 md:p-8">
          <div className="flex flex-col gap-1.5">
            <p className="text-muted-foreground text-xs font-medium">
              שלב {position} מתוך {SETUP_STEPS.length}
            </p>
            <h1 className="text-xl font-semibold">{meta.title}</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">{meta.description}</p>
          </div>
          {children}
          <div className="border-border border-t pt-3 md:hidden">
            <FrameTools exitHref={exitHref} />
          </div>
        </section>
      </Card>
    </div>
  );
}

function FrameTools({ exitHref, stacked = false }: { exitHref: string | null; stacked?: boolean }) {
  return (
    <div className={cn("flex gap-1", stacked ? "flex-col items-stretch" : "items-center")}>
      <ThemeToggle className="px-2 whitespace-nowrap" />
      {exitHref && (
        <Link
          href={exitHref}
          className="text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-md px-2 py-2 text-sm font-medium whitespace-nowrap transition-colors"
        >
          להמשיך מאוחר יותר
        </Link>
      )}
    </div>
  );
}

function StepMarker({ index, status }: { index: number; status: StepStatus }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
        status === "done" && "bg-primary text-primary-foreground border-transparent",
        status === "current" && "border-foreground text-foreground",
        status === "upcoming" && "border-border text-muted-foreground",
      )}
    >
      {status === "done" ? <Check className="size-3.5" /> : index + 1}
    </span>
  );
}
