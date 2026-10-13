"use client";

import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFrameVariant } from "./setup-frame";
import type { StepNavigation } from "./step-navigation";

export type StepFooterPrimary = {
  readonly label?: string;
  /** Defaults to `navigation.advance`. Ignored for a `submit` button, whose form handles it. */
  readonly onClick?: () => void;
  readonly type?: "button" | "submit";
  readonly pending?: boolean;
  readonly disabled?: boolean;
};

export type StepFooterProps = {
  readonly navigation: StepNavigation;
  /** Override the primary button when the step has work to do before moving on. */
  readonly primary?: StepFooterPrimary;
};

/**
 * Back, skip and continue, wired to the frame's navigation. A step body renders
 * this once, last; it overrides only `primary`. In RTL the forward direction
 * is leftward, hence the arrow choice.
 */
export function StepFooter({ navigation, primary = {} }: StepFooterProps) {
  const variant = useFrameVariant();
  const busy = navigation.pending || primary.pending === true;
  const label = primary.label ?? (navigation.isLast ? "סיום וכניסה לאפליקציה" : "המשך");
  const type = primary.type ?? "button";

  const buttons = (
    <>
      <div>
        {navigation.back && (
          <Button variant="ghost" size="lg" onClick={navigation.back} disabled={busy}>
            <ArrowRight />
            חזרה
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {navigation.skip && (
          <Button variant="ghost" size="lg" onClick={navigation.skip} disabled={busy}>
            דילוג
          </Button>
        )}
        <Button
          size="lg"
          type={type}
          onClick={type === "submit" ? undefined : (primary.onClick ?? navigation.advance)}
          disabled={busy || primary.disabled === true}
          className="min-w-24"
        >
          {busy ? <Loader2 className="animate-spin" /> : null}
          {label}
          {!busy && <ArrowLeft />}
        </Button>
      </div>
    </>
  );

  if (variant === "focus") {
    return (
      <div className="bg-background border-border fixed inset-x-0 bottom-0 border-t">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3 sm:px-6">
          {buttons}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border-border flex items-center justify-between border-t pt-4",
        variant === "stepper" && "mt-2",
      )}
    >
      {buttons}
    </div>
  );
}
