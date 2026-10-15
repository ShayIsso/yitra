"use client";

import { Loader2, CheckCircle2, XCircle, AlertTriangle, CircleSlash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BankSyncState } from "@/components/sync-stream";

// One institution's live sync status and OTP entry, shared by the Sync page and the wizard.

export const STATUS_TEXT: Record<string, string> = {
  initializing: "מאתחל...",
  logging_in: "מתחבר...",
  login_success: "התחברות הצליחה",
  scraping: "מוריד תנועות...",
  importing: "מייבא לבסיס נתונים...",
  complete: "הושלם",
  error: "שגיאה",
  otp_required: "נדרש קוד אימות",
  otp_timeout: "פג תוקף הקוד",
  interrupted: "הופסק",
};

const SPINNING_STATUSES = new Set(["initializing", "logging_in", "scraping", "importing"]);

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function LiveBankStatus({ state }: { state: BankSyncState }) {
  return (
    <>
      {SPINNING_STATUSES.has(state.status) && (
        <span className="text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-4 w-4 animate-spin" />
          {STATUS_TEXT[state.status]}
        </span>
      )}
      {state.status === "login_success" && (
        <span className="text-foreground flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4" />
          {STATUS_TEXT.login_success}
        </span>
      )}
      {state.status === "complete" && (
        <span className="text-foreground flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4" />
          {state.transactionCount !== undefined
            ? `${state.transactionCount} תנועות`
            : STATUS_TEXT.complete}
        </span>
      )}
      {state.status === "otp_required" && (
        <span className="text-muted-foreground flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4" />
          {STATUS_TEXT.otp_required}
        </span>
      )}
      {state.status === "otp_timeout" && (
        <span className="text-destructive flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4" />
          {STATUS_TEXT.otp_timeout}
        </span>
      )}
      {state.status === "interrupted" && (
        <span className="text-muted-foreground flex items-center gap-1.5">
          <CircleSlash className="h-4 w-4" />
          {STATUS_TEXT.interrupted}
        </span>
      )}
      {state.status === "error" && (
        <span className="text-destructive flex items-center gap-1.5">
          <XCircle className="h-4 w-4" />
          {state.error ?? STATUS_TEXT.error}
        </span>
      )}
    </>
  );
}

export type OtpEntryProps = {
  readonly code: string;
  /** Hidden when `undefined` or zero. */
  readonly secondsLeft: number | undefined;
  readonly onCodeChange: (code: string) => void;
  readonly onSubmit: () => void;
};

export function OtpEntry({ code, secondsLeft, onCodeChange, onSubmit }: OtpEntryProps) {
  return (
    <div className="flex items-center gap-2">
      <Input
        className="max-w-[160px]"
        placeholder="הזן קוד SMS"
        value={code}
        onChange={(e) => onCodeChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
        }}
      />
      <Button size="sm" onClick={onSubmit}>
        אשר
      </Button>
      {secondsLeft !== undefined && secondsLeft > 0 && (
        <span className="text-muted-foreground text-sm">{formatCountdown(secondsLeft)}</span>
      )}
    </div>
  );
}
