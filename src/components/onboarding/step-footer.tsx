"use client";

import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
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
 * `skip: null` where its primary already leads where skipping would. In RTL the forward direction
 * is leftward, hence the arrow choice.
 */
export function StepFooter({ navigation, primary = {} }: StepFooterProps) {
  const busy = navigation.pending || primary.pending === true;
  const label = primary.label ?? (navigation.isLast ? "סיום וכניסה לאפליקציה" : "המשך");
  const type = primary.type ?? "button";

  return (
    <div className="border-border flex flex-wrap-reverse items-center justify-between gap-2 border-t pt-4">
      <div>
        {navigation.back && (
          <Button variant="ghost" size="lg" onClick={navigation.back} disabled={busy}>
            <ArrowRight />
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
          className="min-w-24"
        >
          {busy ? <Loader2 className="animate-spin" /> : null}
          {label}
          {!busy && <ArrowLeft />}
        </Button>
      </div>
    </div>
  );
}
