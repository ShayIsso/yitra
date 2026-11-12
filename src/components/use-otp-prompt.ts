"use client";

import { useState } from "react";
import { awaitsCode } from "@/components/bank-status-view";
import type { SyncStreamState } from "@/components/sync-stream";
// Type-only: home loads the sheet itself lazily, so this hook must not import it.
import type { OtpSheetProps } from "@/components/sync-otp-sheet";

type Institution = { readonly bankType: string; readonly displayName: string };

export type OtpPrompt<I extends Institution> = {
  /** The institution the run is waiting on for a code, if any. */
  readonly institution: I | null;
  /** Props for `<OtpSheet>`, or null while no code is awaited. */
  readonly sheet: OtpSheetProps | null;
  /** The institution whose prompt the owner closed while its code is still awaited. */
  readonly closedFor: string | null;
  /** Forget a closed prompt: it shows again if a code is awaited (its row's button, a new run). */
  readonly reopen: () => void;
};

/**
 * The one-time-code prompt shared by home, the Sync page and the setup
 * wizard: the sheet opens for the institution awaiting a code, closing it only
 * hides it (the bank keeps waiting until its window runs out), and the
 * institution's row offers the way back in while it is closed.
 */
export function useOtpPrompt<I extends Institution>(
  institutions: readonly I[],
  stream: SyncStreamState,
  actions: {
    readonly setOtpDraft: (bank: string, code: string) => void;
    readonly submitOtp: (bank: string) => unknown;
  },
): OtpPrompt<I> {
  const [closedBank, setClosedBank] = useState<string | null>(null);
  const institution =
    institutions.find((i) => awaitsCode(stream.bankStates[i.bankType], stream.otp[i.bankType])) ??
    null;
  const bank = institution?.bankType ?? null;

  return {
    institution,
    sheet:
      institution && bank
        ? {
            open: closedBank !== bank,
            bankType: bank,
            displayName: institution.displayName,
            code: stream.otpDrafts[bank] ?? "",
            countdown: stream.otp[bank],
            onCodeChange: (code) => actions.setOtpDraft(bank, code),
            onSubmit: () => void actions.submitOtp(bank),
            onDismiss: () => setClosedBank(bank),
          }
        : null,
    closedFor: bank !== null && closedBank === bank ? bank : null,
    reopen: () => setClosedBank(null),
  };
}
