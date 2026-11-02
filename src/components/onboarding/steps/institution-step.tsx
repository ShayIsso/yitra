"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, ShieldCheckIcon, TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { CredentialFields } from "@/components/credential-fields";
import { InstitutionPicker, useInstitutionPicker } from "@/components/institution-picker";
import {
  addInstitutionCredentialAction,
  removeInstitutionCredentialAction,
} from "@/app/setup/institution-actions";
import { enabledBankEntries, findBankEntry, type BankType } from "@/lib/bank-registry";
import { addCredentialSchema } from "@/lib/credentials/schemas";
import {
  credentialValuesFor,
  emptyCredentialValues,
  type CredentialValues,
} from "@/lib/credentials/form";
import { fetchConnectedInstitutions, type ConnectedInstitution } from "../connected-institutions";
import { InstitutionIdentity } from "../institution-identity";
import { StepFooter } from "../step-footer";
import type { SetupStepProps, StepMeta } from "../step-navigation";

/** Slot owned by #260: the first institution, through the registry-driven credential form (epic #248 §2, §10). Contract: `../step-navigation.ts`. */
export const institutionStepMeta: StepMeta = {
  label: "חשבון",
  title: "חיבור בנק או כרטיס אשראי",
  description: "בחרו את הבנק או חברת האשראי, והזינו את פרטי ההתחברות שלכם לאתר שלהם.",
};

type ConnectedLoad =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly connected: ConnectedInstitution[] };

type InstitutionFormValues = {
  bankType: BankType;
  displayName: string;
  credentials: CredentialValues;
};

function emptyForm(): InstitutionFormValues {
  const [first] = enabledBankEntries();
  return { bankType: first.id, displayName: "", credentials: emptyCredentialValues(first) };
}

/**
 * Revisiting the step (back from a later one, or a resumed wizard on an
 * install that already has credentials) shows what is connected instead of an
 * empty form, so pressing on does not store the same institution twice; adding
 * another stays one click away. A credential the first sync rejected is fixed
 * by removing it and adding it again: removing the last one reopens the form.
 */
export function InstitutionStep({ navigation }: SetupStepProps) {
  const [existing, setExisting] = useState<ConnectedLoad>({ status: "loading" });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let active = true;
    // A failed read falls back to the form: a second credential is recoverable
    // in Settings, a step that cannot connect anything is not.
    fetchConnectedInstitutions().then((connected) => {
      if (active) setExisting({ status: "ready", connected: connected ?? [] });
    });
    return () => {
      active = false;
    };
  }, []);

  if (existing.status === "loading") {
    return (
      <div className="flex flex-col gap-6">
        <div aria-busy="true" className="flex flex-col gap-4">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
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
        onRemoved={(id) =>
          setExisting({
            status: "ready",
            connected: existing.connected.filter((credential) => credential.id !== id),
          })
        }
        navigation={navigation}
      />
    );
  }

  return <InstitutionForm navigation={navigation} />;
}

export function ConnectedSummary({
  connected,
  onAddAnother,
  onRemoved,
  navigation,
}: {
  connected: ConnectedInstitution[];
  onAddAnother: () => void;
  onRemoved: (id: string) => void;
} & SetupStepProps) {
  const [target, setTarget] = useState<ConnectedInstitution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, startRemoving] = useTransition();

  function openRemove(credential: ConnectedInstitution) {
    setError(null);
    setTarget(credential);
  }

  function confirmRemove() {
    if (!target) return;
    startRemoving(async () => {
      const result = await removeInstitutionCredentialAction({ id: target.id });
      if (!result.removed) {
        setError(result.error ?? null);
        return;
      }
      setTarget(null);
      onRemoved(target.id);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-caption font-medium">חשבונות מחוברים</h2>
        <ul className="border-border divide-border flex flex-col divide-y rounded-xl border">
          {connected.map((credential) => (
            <li key={credential.id} className="flex min-w-0 items-center gap-3 px-4 py-3">
              <InstitutionIdentity
                bankType={credential.bankType}
                displayName={credential.displayName}
              />
              <Button
                variant="ghost"
                size="lg"
                className="text-muted-foreground min-w-11 shrink-0"
                onClick={() => openRemove(credential)}
                disabled={navigation.pending}
                aria-label={`הסרת ${credential.displayName}`}
              >
                <TrashIcon />
                <span className="max-sm:sr-only">הסרה</span>
              </Button>
            </li>
          ))}
        </ul>
      </section>
      <div>
        <Button variant="outline" size="lg" onClick={onAddAnother} disabled={navigation.pending}>
          <PlusIcon />
          הוספת חשבון נוסף
        </Button>
      </div>
      <StepFooter navigation={navigation} />

      <Dialog open={target !== null} onOpenChange={(open) => !open && !removing && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הסרת חשבון</DialogTitle>
            <DialogDescription>
              להסיר את &ldquo;{target?.displayName}&rdquo;? יימחקו גם החשבונות והתנועות שיובאו ממנו.
              כדי לתקן פרטי התחברות, הסירו את החשבון וחברו אותו מחדש עם הפרטים הנכונים.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-destructive text-body">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              size="lg"
              className="min-h-11"
              onClick={() => setTarget(null)}
              disabled={removing}
            >
              ביטול
            </Button>
            <Button
              variant="destructive"
              size="lg"
              className="min-h-11"
              onClick={confirmRemove}
              disabled={removing}
            >
              {removing ? "מסיר..." : "הסרה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
        <div className="flex flex-col gap-5">
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

          <FormRootError role="alert" />

          <p className="bg-muted text-body flex items-start gap-3 rounded-lg p-4">
            <ShieldCheckIcon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
            <span className="text-pretty">
              הפרטים נשמרים מוצפנים במסד הנתונים שלכם, ומשמשים רק למשיכת התנועות.
            </span>
          </p>
        </div>

        <StepFooter
          navigation={navigation}
          primary={{ label: "שמירה והמשך", type: "submit", pending: saving }}
        />
      </form>
    </Form>
  );
}
