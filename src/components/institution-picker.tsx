"use client";

/**
 * The institution picker for every form that connects an institution —
 * Settings' add-credential dialog, and the first-run wizard. It owns three things a consumer should not re-derive:
 * the options (every enabled registry entry under `bankLabel`, in registry
 * order, trigger and menu labelled alike), a trust badge per option, and the
 * acknowledgment an experimental institution requires before the consuming
 * form may submit (ADR-0013 §3). Verified and observed institutions need none.
 *
 * Usage with react-hook-form:
 *
 *   const picker = useInstitutionPicker();
 *
 *   function onSubmit(values) {
 *     if (!picker.confirmCleared(values.bankType)) return; // shows the prompt's error
 *     ...
 *   }
 *   // So a missing acknowledgment shows alongside field errors, not after them:
 *   const onInvalid = () => picker.confirmCleared(form.getValues("bankType"));
 *
 *   <form onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
 *
 * An acknowledgment belongs to one form session: call `picker.reset()` wherever
 * the form itself is reset for a fresh entry, or it carries over to the next one.
 *
 *   <FormField control={form.control} name="bankType" render={({ field }) => (
 *     <FormItem>
 *       <FormLabel>מוסד</FormLabel>
 *       <FormControl>
 *         <InstitutionPicker
 *           picker={picker}
 *           value={field.value}
 *           onValueChange={(entry) => field.onChange(entry.id)}
 *         />
 *       </FormControl>
 *       <FormMessage />
 *     </FormItem>
 *   )} />
 *
 * `picker.isCleared(id)` answers the same question without side effects, e.g.
 * to disable a submit button. `picker.trustOf(id)` serves any list on the same
 * screen, so one evidence read feeds both.
 *
 * Evidence: by default the hook reads `GET /api/sync-runs/evidence` once on
 * mount. Until it answers — and if it fails, or before this install has any
 * sync — every experimental institution shows its caveat: the evidence can
 * only retire a caveat, never be needed to show one. A consumer that already
 * holds the evidence passes it as `useInstitutionPicker({ observed })` and no
 * request is made. The picker imports no Server Action, so it is safe to
 * render from the auth-exempt `/setup` page.
 */

import * as React from "react";
import { FlaskConical } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { InstitutionTrustBadge } from "@/components/institution-trust";
import {
  bankLabel,
  bankTrustOf,
  enabledBankEntries,
  enabledBankTypes,
  type BankRegistryEntry,
  type BankTrust,
  type BankType,
} from "@/lib/bank-registry";

const EVIDENCE_URL = "/api/sync-runs/evidence";

/**
 * The picker's menu, in registry order. The trigger labels the selection
 * through the same `bankLabel`, so menu and trigger cannot disagree.
 */
export function bankPickerOptions(): { value: BankType; label: string }[] {
  return enabledBankTypes().map((value) => ({ value, label: bankLabel(value) }));
}

/** Anything but a well-formed evidence body reads as no evidence, so the caveat stays. */
export function observedFromResponse(body: unknown): ReadonlySet<string> {
  if (body === null || typeof body !== "object" || !("observed" in body)) return new Set();
  const { observed } = body;
  if (!Array.isArray(observed)) return new Set();
  return new Set(observed.filter((id): id is string => typeof id === "string"));
}

/**
 * Pure form of the submit gate. An acknowledgment is held for one institution
 * id, so switching institution can never carry it over to another.
 */
export function isInstitutionCleared(
  trust: BankTrust | undefined,
  id: string,
  acknowledgedId: string | null,
): boolean {
  return trust !== "experimental" || acknowledgedId === id;
}

export interface InstitutionPickerState {
  trustOf(id: string): BankTrust | undefined;
  /** No acknowledgment needed, or one was given for this id. Side-effect free. */
  isCleared(id: string): boolean;
  /** `isCleared`, and when false also reveals the acknowledgment prompt's error. */
  confirmCleared(id: string): boolean;
  /** Forgets any acknowledgment and its error, for a fresh form session. */
  reset(): void;
  /** For `<InstitutionPicker>`; consumers read the methods above. */
  readonly acknowledgment: {
    readonly acknowledgedId: string | null;
    readonly missingFor: string | null;
    set(id: string, acknowledged: boolean): void;
  };
}

export function useInstitutionPicker(
  options: { observed?: readonly string[] } = {},
): InstitutionPickerState {
  const supplied = options.observed;
  const [fetched, setFetched] = React.useState<ReadonlySet<string>>(() => new Set());
  const [acknowledgedId, setAcknowledgedId] = React.useState<string | null>(null);
  const [missingFor, setMissingFor] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (supplied) return;
    let current = true;
    fetch(EVIDENCE_URL)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (current) setFetched(observedFromResponse(body));
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [supplied]);

  const observed = React.useMemo(
    () => (supplied ? new Set(supplied) : fetched),
    [supplied, fetched],
  );

  return React.useMemo<InstitutionPickerState>(() => {
    const trustOf = (id: string) => bankTrustOf(id, observed);
    const isCleared = (id: string) => isInstitutionCleared(trustOf(id), id, acknowledgedId);
    return {
      trustOf,
      isCleared,
      confirmCleared(id) {
        const cleared = isCleared(id);
        setMissingFor(cleared ? null : id);
        return cleared;
      },
      reset() {
        setAcknowledgedId(null);
        setMissingFor(null);
      },
      acknowledgment: {
        acknowledgedId,
        missingFor,
        set(id, acknowledged) {
          setAcknowledgedId(acknowledged ? id : null);
          if (acknowledged) setMissingFor(null);
        },
      },
    };
  }, [observed, acknowledgedId, missingFor]);
}

/**
 * `id` and the aria props are what `FormControl` injects; they land on the
 * trigger so the field's label and error message describe the select.
 */
export function InstitutionPicker({
  picker,
  value,
  onValueChange,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: {
  picker: InstitutionPickerState;
  value: BankType;
  onValueChange: (entry: BankRegistryEntry & { readonly id: BankType }) => void;
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const acknowledgmentId = React.useId();
  const trust = picker.trustOf(value);
  const { acknowledgment } = picker;

  return (
    <div className="space-y-3">
      <Select
        value={value}
        onValueChange={(next) => {
          const entry = enabledBankEntries().find((candidate) => candidate.id === next);
          if (entry) onValueChange(entry);
        }}
      >
        <SelectTrigger
          id={id}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          className="w-full"
        >
          <span className="flex items-center gap-2">
            {bankLabel(value)}
            <InstitutionTrustBadge trust={trust} />
          </span>
        </SelectTrigger>
        <SelectContent>
          {bankPickerOptions().map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
              <InstitutionTrustBadge trust={picker.trustOf(option.value)} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {trust === "experimental" && (
        <div
          data-slot="institution-acknowledgment"
          className="bg-muted/50 space-y-3 rounded-lg border p-3 text-sm"
        >
          <p className="flex gap-2">
            <FlaskConical className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <span>
              {bankLabel(value)} נתמך, אך עדיין לא נבדק על ידינו מול חשבון אמיתי. ייתכן שהסנכרון
              ייכשל או יחזיר נתונים חלקיים.
            </span>
          </p>
          <label htmlFor={acknowledgmentId} className="flex items-center gap-2 font-medium">
            <Checkbox
              id={acknowledgmentId}
              checked={acknowledgment.acknowledgedId === value}
              onCheckedChange={(checked) => acknowledgment.set(value, checked === true)}
              aria-invalid={acknowledgment.missingFor === value}
            />
            הבנתי, להמשיך עם מוסד ניסיוני
          </label>
          {acknowledgment.missingFor === value && (
            <p className="text-destructive">יש לאשר את השימוש במוסד ניסיוני כדי להמשיך</p>
          )}
        </div>
      )}
    </div>
  );
}
