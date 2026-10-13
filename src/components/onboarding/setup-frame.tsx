"use client";

import { createContext, useContext } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SETUP_STEPS, type SetupStep } from "@/lib/onboarding/steps";
import { STEP_META } from "./step-meta";

/**
 * Prototype-gate variants (#258 AC 1). `stepper` — numbered stepper above a
 * single card; `rail` — two-pane card with a vertical step list; `focus` — no
 * card, segmented bar, full-width fixed footer. The owner picks one and the
 * others are deleted.
 */
export type FrameVariant = "stepper" | "rail" | "focus";

const FrameVariantContext = createContext<FrameVariant>("stepper");

export function useFrameVariant(): FrameVariant {
  return useContext(FrameVariantContext);
}

type StepStatus = "done" | "current" | "upcoming";

function statusOf(step: SetupStep, current: SetupStep, passwordDone: boolean): StepStatus {
  if (step === current) return "current";
  if (step === "password" && passwordDone) return "done";
  return SETUP_STEPS.indexOf(step) < SETUP_STEPS.indexOf(current) ? "done" : "upcoming";
}

export type SetupFrameProps = {
  readonly variant: FrameVariant;
  readonly step: SetupStep;
  readonly passwordDone: boolean;
  /** Where "continue later" leads; `null` while no session exists yet (the password step). */
  readonly exitHref: string | null;
  readonly children: React.ReactNode;
};

export function SetupFrame(props: SetupFrameProps) {
  const Frame = { stepper: StepperFrame, rail: RailFrame, focus: FocusFrame }[props.variant];
  return (
    <FrameVariantContext.Provider value={props.variant}>
      <Frame {...props} />
    </FrameVariantContext.Provider>
  );
}

function Brand() {
  return (
    <span className="flex items-center gap-2 text-base font-semibold">
      <BrandMark className="h-5 w-auto" />
      Yitra
    </span>
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

function StepCountLabel({ step }: { step: SetupStep }) {
  return (
    <p className="text-muted-foreground text-xs font-medium">
      שלב {SETUP_STEPS.indexOf(step) + 1} מתוך {SETUP_STEPS.length}
    </p>
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

// ── Variant A: stepper above one card ────────────────────────────────────────

function StepperFrame({ step, passwordDone, exitHref, children }: SetupFrameProps) {
  const meta = STEP_META[step];
  return (
    <div className="flex min-h-full flex-1 flex-col items-center px-4 py-6 sm:py-10">
      <header className="flex w-full max-w-xl items-center justify-between">
        <Brand />
        <FrameTools exitHref={exitHref} />
      </header>

      <ol className="mt-8 flex w-full max-w-xl items-start" aria-label="שלבי ההגדרה">
        {SETUP_STEPS.map((s, i) => {
          const status = statusOf(s, step, passwordDone);
          return (
            <li
              key={s}
              className="flex flex-1 flex-col items-center gap-2 last:flex-none"
              aria-current={status === "current" ? "step" : undefined}
            >
              <div className="flex w-full items-center">
                <StepMarker index={i} status={status} />
                {i < SETUP_STEPS.length - 1 && (
                  <span
                    className={cn(
                      "mx-2 h-px flex-1",
                      status === "done" ? "bg-foreground/40" : "bg-border",
                    )}
                  />
                )}
              </div>
              <span
                className={cn(
                  "w-full text-start text-xs",
                  status === "current" ? "text-foreground font-medium" : "text-muted-foreground",
                  status !== "current" && "hidden sm:block",
                )}
              >
                {STEP_META[s].label}
              </span>
            </li>
          );
        })}
      </ol>

      <Card className="mt-6 w-full max-w-xl">
        <CardHeader className="gap-1.5">
          <h1 className="text-lg font-semibold">{meta.title}</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">{meta.description}</p>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

// ── Variant B: two-pane card with a vertical rail ────────────────────────────

function RailFrame({ step, passwordDone, exitHref, children }: SetupFrameProps) {
  const meta = STEP_META[step];
  const position = SETUP_STEPS.indexOf(step) + 1;
  return (
    <div className="flex min-h-full flex-1 items-start justify-center px-4 py-6 md:items-center md:py-10">
      <Card className="w-full max-w-4xl gap-0 py-0 md:flex-row">
        <aside className="bg-muted/50 border-border flex flex-col gap-6 border-b p-5 md:w-64 md:border-e md:border-b-0 md:p-6">
          <div className="flex items-center justify-between">
            <Brand />
            <span className="text-muted-foreground text-xs font-medium tabular-nums md:hidden">
              {position}/{SETUP_STEPS.length}
            </span>
          </div>

          <div className="md:hidden">
            <div className="bg-border h-1 overflow-hidden rounded-full">
              <div
                className="bg-foreground/70 h-full rounded-full"
                style={{ width: `${(position / SETUP_STEPS.length) * 100}%` }}
              />
            </div>
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
            <StepCountLabel step={step} />
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

// ── Variant C: focus page, segmented bar, fixed footer ───────────────────────

function FocusFrame({ step, passwordDone, exitHref, children }: SetupFrameProps) {
  const meta = STEP_META[step];
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-border flex items-center justify-between border-b px-4 py-2 sm:px-6">
        <Brand />
        <FrameTools exitHref={exitHref} />
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 pt-8 pb-28 sm:px-6 sm:pt-12">
        <div className="flex flex-col gap-3">
          <ol className="flex gap-1.5" aria-label="שלבי ההגדרה">
            {SETUP_STEPS.map((s) => {
              const status = statusOf(s, step, passwordDone);
              return (
                <li
                  key={s}
                  aria-current={status === "current" ? "step" : undefined}
                  aria-label={STEP_META[s].label}
                  className={cn(
                    "h-1 flex-1 rounded-full",
                    status === "done" && "bg-foreground/70",
                    status === "current" && "bg-foreground",
                    status === "upcoming" && "bg-border",
                  )}
                />
              );
            })}
          </ol>
          <p className="text-muted-foreground text-xs font-medium">
            שלב {SETUP_STEPS.indexOf(step) + 1} מתוך {SETUP_STEPS.length} · {meta.label}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">{meta.title}</h1>
          <p className="text-muted-foreground leading-relaxed">{meta.description}</p>
        </div>

        {children}
      </main>
    </div>
  );
}
