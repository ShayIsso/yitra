"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormRootError,
  applyActionErrors,
} from "@/components/ui/form";
import { BankBadge } from "@/components/bank-badge";
import { CredentialFields } from "@/components/credential-fields";
import { InstitutionPicker, useInstitutionPicker } from "@/components/institution-picker";
import { addInstitutionCredentialAction } from "@/app/setup/institution-actions";
import { enabledBankEntries, findBankEntry, type BankType } from "@/lib/bank-registry";
import { addCredentialSchema } from "@/lib/credentials/schemas";
import {
  credentialValuesFor,
  emptyCredentialValues,
  type CredentialValues,
} from "@/lib/credentials/form";
import { StepFooter } from "../step-footer";
import type { SetupStepProps, StepMeta } from "../step-navigation";

/** Slot owned by #260: the first institution, through the registry-driven credential form (epic #248 §2, §10). Contract: `../step-navigation.ts`. */
export const institutionStepMeta: StepMeta = {
  label: "חשבון",
  title: "חיבור בנק או כרטיס אשראי",
  description: "הוסיפו את פרטי ההתחברות לחשבון הראשון. הפרטים נשמרים מוצפנים במסד הנתונים שלכם.",
};

type Connected = { readonly id: string; readonly bankType: string; readonly displayName: string };

type Existing =
  | { readonly status: "loading" }
  | { readonly status: "ready"; connected: Connected[] };

type InstitutionFormValues = {
  bankType: BankType;
  displayName: string;
  credentials: CredentialValues;
};

function emptyForm(): InstitutionFormValues {
  const [first] = enabledBankEntries();
  return { bankType: first.id, displayName: "", credentials: emptyCredentialValues(first) };
}

/** Anything but a list reads as nothing connected, so the step falls back to its form. */
function connectedFrom(body: unknown): Connected[] {
  return Array.isArray(body) ? (body as Connected[]) : [];
}

/**
 * Revisiting the step (back from a later one, or a resumed wizard on an
 * install that already has credentials) shows what is connected instead of an
 * empty form, so pressing on does not store the same institution twice; adding
 * another stays one click away.
 */
export function InstitutionStep({ navigation }: SetupStepProps) {
  const [existing, setExisting] = useState<Existing>({ status: "loading" });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/credentials")
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((body: unknown) => {
        if (active) setExisting({ status: "ready", connected: connectedFrom(body) });
      });
    return () => {
      active = false;
    };
  }, []);

  if (existing.status === "loading") {
    return (
      <div className="flex flex-col gap-6">
        <div aria-busy="true" className="flex flex-col gap-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
        <StepFooter navigation={navigation} primary={{ disabled: true }} />
      </div>
    );
  }

  if (existing.connected.length > 0 && !adding) {
    return (
      <ConnectedSummary
        connected={existing.connected}
        onAddAnother={() => setAdding(true)}
        navigation={navigation}
      />
    );
  }

  return <InstitutionForm navigation={navigation} />;
}

function ConnectedSummary({
  connected,
  onAddAnother,
  navigation,
}: {
  connected: Connected[];
  onAddAnother: () => void;
} & SetupStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <section className="border-border rounded-lg border">
        <h3 className="bg-muted/50 px-4 py-2 text-sm font-semibold">חשבונות מחוברים</h3>
        <ul className="flex flex-col gap-2 px-4 py-3">
          {connected.map((credential) => (
            <li key={credential.id} className="flex min-w-0 items-center gap-3 text-sm">
              <BankBadge bankType={credential.bankType} />
              <span className="truncate">{credential.displayName}</span>
            </li>
          ))}
        </ul>
      </section>
      <div>
        <Button variant="outline" onClick={onAddAnother} disabled={navigation.pending}>
          <Plus />
          הוספת חשבון נוסף
        </Button>
      </div>
      <StepFooter navigation={navigation} />
    </div>
  );
}

function InstitutionForm({ navigation }: SetupStepProps) {
  const [saving, startSaving] = useTransition();
  const resolver = useMemo(
    // The union's per-branch input type is narrower than the generic form
    // values; the schema is the one the action validates with.
    () => zodResolver(addCredentialSchema) as unknown as Resolver<InstitutionFormValues>,
    [],
  );
  const form = useForm<InstitutionFormValues>({ resolver, defaultValues: emptyForm() });
  const picker = useInstitutionPicker();
  const selectedEntry = findBankEntry(useWatch({ control: form.control, name: "bankType" }));

  // A missing acknowledgment is reported alongside field errors, not only once they are fixed.
  const onInvalid = () => picker.confirmCleared(form.getValues("bankType"));

  function onSubmit(values: InstitutionFormValues) {
    const entry = findBankEntry(values.bankType);
    if (!entry || !picker.confirmCleared(values.bankType)) return;

    startSaving(async () => {
      const result = await addInstitutionCredentialAction({
        bankType: values.bankType,
        displayName: values.displayName,
        credentials: credentialValuesFor(entry, values.credentials),
      });
      if (!result.added) {
        applyActionErrors(form, result);
        return;
      }
      navigation.advance();
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, onInvalid)}
        className="flex flex-col gap-6"
        noValidate
      >
        <div className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="bankType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>בנק או חברת אשראי</FormLabel>
                <FormControl>
                  <InstitutionPicker
                    picker={picker}
                    value={field.value}
                    onValueChange={(next) => {
                      field.onChange(next.id);
                      // An institution switch swaps the field set — start it clean.
                      form.setValue("credentials", emptyCredentialValues(next));
                      form.clearErrors("credentials");
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="displayName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>שם תצוגה</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="לדוגמה: חשבון עיקרי" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {selectedEntry && <CredentialFields entry={selectedEntry} mode="add" />}

          <FormRootError />
        </div>

        <StepFooter
          navigation={navigation}
          primary={{ label: "שמירה והמשך", type: "submit", pending: saving }}
        />
      </form>
    </Form>
  );
}
