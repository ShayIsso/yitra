"use client";

import { useId, useRef } from "react";
import { KeyIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCountdown, StageProgress } from "@/components/sync-bank-status";
import { OTP_WINDOW_SECONDS, type OtpCountdown } from "@/components/sync-stream";
import { bankLabel } from "@/lib/bank-registry";

function minutesLeftText(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return minutes <= 1 ? "נותרה פחות מדקה להזנת הקוד" : `נותרו ${minutes} דקות להזנת הקוד`;
}

/**
 * The visible clock changes every second, so it is not a live region; its
 * sr-only twin changes once a minute, often enough to hear and rare enough not
 * to drown out the field. The bar steps without a transition: a per-second
 * animation for three minutes is not the once-only motion ADR-0015 allows.
 */
function Countdown({ countdown }: { countdown: OtpCountdown | undefined }) {
  if (!countdown) return null;
  const { secondsLeft } = countdown;
  if (secondsLeft <= 0) {
    return (
      <p role="alert" className="text-attention-text text-body font-medium">
        הזמן להזנת הקוד הסתיים.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-body flex items-center justify-between gap-3">
        <span>הזמן שנותר להזנת הקוד</span>
        <span role="timer" className="text-foreground font-medium tabular-nums" dir="ltr">
          {formatCountdown(secondsLeft)}
        </span>
      </p>
      <span className="sr-only" aria-live="polite">
        {minutesLeftText(secondsLeft)}
      </span>
      <StageProgress
        value={secondsLeft / OTP_WINDOW_SECONDS}
        fillClassName="bg-attention transition-none"
      />
    </div>
  );
}

export type OtpSheetProps = {
  readonly open: boolean;
  readonly bankType: string;
  readonly displayName: string;
  readonly code: string;
  readonly countdown: OtpCountdown | undefined;
  readonly onCodeChange: (code: string) => void;
  readonly onSubmit: () => void;
  /** Closing only hides the prompt: the bank keeps waiting until its window runs out. */
  readonly onDismiss: () => void;
};

/**
 * The one-time-code prompt: a bottom sheet on phones, a centred dialog from
 * `md`. The code goes to the OTP bridge exactly as before; the 3-minute window
 * is the server's (`OTP_WINDOW_SECONDS` only mirrors it for the clock).
 */
export function OtpSheet({
  open,
  bankType,
  displayName,
  code,
  countdown,
  onCodeChange,
  onSubmit,
  onDismiss,
}: OtpSheetProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
    >
      <DialogContent className="md:max-w-md" initialFocus={inputRef}>
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <DialogHeader className="gap-3">
            <span className="bg-attention-subtle text-attention-text grid size-12 place-items-center rounded-full">
              <KeyIcon className="size-6" />
            </span>
            <DialogTitle className="text-title font-semibold">נדרש קוד אימות</DialogTitle>
            <DialogDescription className="text-body leading-relaxed text-pretty">
              {`${bankLabel(bankType)} (${displayName}) שלח קוד חד-פעמי ב-SMS. הזינו אותו כאן כדי שהסנכרון ימשיך.`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor={inputId} className="text-body">
              קוד אימות
            </Label>
            <Input
              id={inputId}
              ref={inputRef}
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="text-title md:text-title h-12 text-center tracking-[0.2em] tabular-nums"
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
            />
          </div>

          <Countdown countdown={countdown} />

          <DialogFooter>
            <Button type="button" variant="outline" className="md:h-9" onClick={onDismiss}>
              אחר כך
            </Button>
            <Button type="submit" className="md:h-9 md:px-4" disabled={!code.trim()}>
              שליחת הקוד
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
