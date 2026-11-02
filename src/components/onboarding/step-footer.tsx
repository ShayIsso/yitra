"use client";

import { CaretLeftIcon, CaretRightIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
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
 * this once, last; it overrides only `primary`, and may pass `navigation` with
 * `skip: null` where its primary already leads where skipping would. In RTL
 * the forward direction is leftward, hence the caret choice. On a phone the bar
 * pins to the bottom of the viewport, so a long step never hides its way on.
 */
export function StepFooter({ navigation, primary = {} }: StepFooterProps) {
  const busy = navigation.pending || primary.pending === true;
  const label = primary.label ?? (navigation.isLast ? "סיום וכניסה לאפליקציה" : "המשך");
  const type = primary.type ?? "button";

  return (
    <div className="bg-background border-border sticky bottom-0 z-10 -mx-4 mt-auto flex flex-wrap-reverse items-center justify-between gap-2 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:static md:mx-0 md:bg-transparent md:px-0 md:pt-5 md:pb-0">
      <div>
        {navigation.back && (
          <Button variant="ghost" size="lg" onClick={navigation.back} disabled={busy}>
            <CaretRightIcon />
            חזרה
          </Button>
        )}
      </div>
      <div className="ms-auto flex items-center gap-2">
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
          aria-busy={busy || undefined}
          className="min-w-28 px-4"
        >
          {label}
          {!busy && <CaretLeftIcon />}
        </Button>
      </div>
    </div>
  );
}
