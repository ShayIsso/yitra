"use client";

import Link from "next/link";
import {
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  ClockIcon,
  KeyIcon,
  PauseIcon,
  WarningCircleIcon,
} from "@/components/icons";
import { liveBankStatus, type BankStatusIcon } from "@/components/bank-status-view";
import type { SyncStreamState } from "@/components/sync-stream";
import { bankLabel } from "@/lib/bank-registry";
import { cn } from "@/lib/utils";
import { HERO_BUTTON } from "./hero-states";
import type { OutlookOf } from "./outlook-view";

export type HomeBank = { id: string; bankType: string; displayName: string };

export const CONNECTION_LOST = "החיבור לשרת נותק לפני שהסנכרון הסתיים. התנועות שכבר יובאו נשמרו.";

function Glyph({ icon }: { icon: BankStatusIcon }) {
  const className = "size-4 shrink-0";
  switch (icon) {
    case "clock":
      return <ClockIcon weight="fill" className={className} />;
    case "sync":
      return <ArrowsClockwiseIcon className={className} />;
    case "check":
      return <CheckCircleIcon weight="fill" className={className} />;
    case "warning":
      return <WarningCircleIcon weight="fill" className={cn(className, "text-attention")} />;
    case "key":
      return <KeyIcon className={cn(className, "text-attention")} />;
    case "pause":
      return <PauseIcon weight="fill" className={className} />;
    case "dot":
      return (
        <span aria-hidden="true" className="grid size-4 shrink-0 place-items-center">
          <span className="bg-hero-muted size-2 rounded-full" />
        </span>
      );
  }
}

/** Decorative: the words beside it carry the state. Fills from the inline start. */
function Bar({ value }: { value: number }) {
  return (
    <div aria-hidden="true" className="bg-hero-foreground/15 h-1.5 overflow-hidden rounded-full">
      <div
        className="bg-hero-foreground h-full origin-left rounded-full transition-transform duration-500 ease-out motion-reduce:transition-none rtl:origin-right"
        style={{ transform: `scaleX(${value})` }}
      />
    </div>
  );
}

/**
 * The first sync on the home screen (#312 story 36). A run this tab drives
 * shows live per-bank progress from the sync stream (`useSyncStream`, the same
 * consumer as the Sync page and the wizard). A run driven elsewhere — another
 * tab, the scheduler — has no stream here, so the outlook's own count is shown
 * and the home screen polls it. With no run at all, one tap starts it.
 */
export function FirstSyncHero({
  outlook,
  banks,
  stream,
  onStart,
}: {
  outlook: OutlookOf<"first-sync">;
  banks: readonly HomeBank[];
  stream: SyncStreamState;
  onStart: () => void;
}) {
  const ours = stream.starting || stream.syncing || Object.keys(stream.bankStates).length > 0;
  const live = stream.starting || stream.syncing;
  const elsewhere = !ours && outlook.progress.running;
  const { banksDone, banksTotal } = outlook.progress;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h3 className="text-title font-semibold">
          {live || elsewhere ? "הסנכרון הראשון רץ" : "עוד רגע מתחילים"}
        </h3>
        <p className="text-hero-muted text-body max-w-prose text-pretty">
          הסנכרון הראשון מושך את התנועות של השנה האחרונה, חשבון אחר חשבון, וזה יכול לקחת כמה דקות.
          בסיומו יופיע כאן כמה יצא החודש וכמה נשאר.
        </p>
      </div>

      {elsewhere ? (
        <div className="flex max-w-md flex-col gap-2">
          <p className="text-body font-medium" aria-live="polite">
            {`הושלמו ${banksDone} מתוך ${banksTotal} חשבונות`}
          </p>
          <Bar value={banksTotal === 0 ? 0 : banksDone / banksTotal} />
          <p className="text-hero-muted text-caption">ההתקדמות מתעדכנת כאן מעצמה.</p>
        </div>
      ) : (
        <ul className="flex max-w-md flex-col gap-3">
          {banks.map((bank) => {
            const view = liveBankStatus(stream.bankStates[bank.bankType], {
              running: live,
              otp: stream.otp[bank.bankType],
            });
            return (
              <li key={bank.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-body min-w-0 truncate font-medium">
                    {bank.displayName}
                    <span className="text-hero-muted font-normal">
                      {" "}
                      · {bankLabel(bank.bankType)}
                    </span>
                  </span>
                  <span
                    role={view.alert ? "alert" : undefined}
                    className="text-body flex shrink-0 items-center gap-1.5"
                  >
                    <Glyph icon={view.icon} />
                    {view.label}
                  </span>
                </div>
                {view.progress !== null && <Bar value={view.progress} />}
              </li>
            );
          })}
        </ul>
      )}

      {live && (
        <p className="text-hero-muted text-caption">
          השאירו את הדף פתוח עד שהסנכרון יסתיים. יציאה מהדף תעצור אותו.
        </p>
      )}

      {stream.refusal && (
        <p role="status" className="text-body">
          {stream.refusal}
        </p>
      )}
      {stream.connectionError && (
        <p role="alert" className="text-body">
          {CONNECTION_LOST}
        </p>
      )}

      {!live && !elsewhere && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={onStart} className={HERO_BUTTON}>
            <ArrowsClockwiseIcon className="size-5" />
            {ours ? "לנסות שוב" : "התחלת הסנכרון הראשון"}
          </button>
          {ours && (
            <Link
              href="/sync"
              className="text-body text-hero-foreground decoration-hero-foreground/40 hover:decoration-hero-foreground inline-flex min-h-11 items-center underline underline-offset-4"
            >
              לפרטים בדף הסנכרון
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
